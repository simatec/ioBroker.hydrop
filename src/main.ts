import * as utils from '@iobroker/adapter-core';
import axios, { type AxiosRequestConfig } from 'axios';
import schedule from 'node-schedule';

class Hydrop extends utils.Adapter {
    private apiBaseUrl: string = 'https://api.hydrop-systems.com';
    private pollInterval: number = 300; // in minutes
    private interval: ioBroker.Interval | undefined;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'hydrop',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        await this.createdHistoryStates(this.config.historyDays);
        await this.delHistoryStates(this.config.historyDays);

        await this.schedulePoll();
        this.log.info('Hydrop adapter started');

        schedule.scheduleJob(
            'dayHistory',
            '0 0 0 * * *',
            async () => await this.setDayHistory(this.config.historyDays),
        );
    }

    private onUnload(callback: () => void): void {
        try {
            this.clearInterval(this.interval);
            schedule.cancelJob('dayHistory');
            callback();
        } catch (e) {
            callback();
        }
    }

    private async schedulePoll(): Promise<void> {
        if (this.config.apiKey === '' || this.config.meterName === '') {
            this.log.error('API Key or Meter Name not configured. Please check the adapter settings.');
            return;
        }

        await this.poll();
        this.interval = this.setInterval(() => this.poll(), this.pollInterval * 1000);
    }

    private async poll(): Promise<void> {
        const available: boolean = await this.validateURL();
        if (!available) {
            this.log.error('Hydrop API not available, skipping poll cycle');
            return;
        }

        try {
            const hydropRequest = await axios({
                method: 'get',
                url: `${this.apiBaseUrl}/sensors/ID/${this.config.meterName}/newest`,
                headers: {
                    apikey: this.config.apiKey,
                },
                timeout: 10000,
                responseType: 'json',
            });

            if (hydropRequest?.data?.sensors?.[0]?.records?.[0]) {
                const oldMeterReading: ioBroker.State | null = (await this.getStateAsync('data.meterReading')) ?? null;
                const oldTimestamp: ioBroker.State | null = (await this.getStateAsync('data.measurementTime')) ?? null;

                const record = hydropRequest.data.sensors[0].records[0];

                await this.setState('data.meterReading', record.meterValue, true);

                const timestampUnix = record.timestamp;
                await this.setState('data.measurementTime', new Date(timestampUnix * 1000).toISOString(), true);

                this.log.debug(
                    `Meter Value: ${record.meterValue} m³ at ${new Date(timestampUnix * 1000).toISOString()}`,
                );

                await this.calcData(record.meterValue, timestampUnix, oldMeterReading, oldTimestamp);
            } else {
                this.log.warn('No valid data received from Hydrop API');
            }
        } catch (error) {
            this.log.error(`Polling error: ${error.message}`);
        }
    }

    private async calcData(
        meterValue: number,
        timestampUnix: number,
        oldMeterReading: ioBroker.State | null,
        oldTimestamp: ioBroker.State | null,
    ): Promise<void> {
        // Calculate Consumption
        if (oldMeterReading?.val) {
            const consumption = meterValue - Number(oldMeterReading.val);
            if (consumption > 0) {
                const _dailyConsumption = (await this.getStateAsync('data.dailyConsumption'))?.val as number;
                const newDailyConsumption = _dailyConsumption + consumption;

                await this.setState('data.dailyConsumption', newDailyConsumption, true);

                this.log.debug(
                    `Calculated Consumption: ${consumption} m³, Daily Consumption: ${newDailyConsumption} m³`,
                );
            } else {
                this.log.debug('No consumption detected (meter value did not increase)');
            }
        } else {
            this.log.debug('Old meter reading not available, skipping consumption calculation');
        }

        // Calculate Flow Rate (L/min)
        if (!oldMeterReading?.val || !oldTimestamp?.val || !meterValue || !timestampUnix) {
            this.log.debug('Old meter reading or timestamp not available, skipping flow rate calculation');
            return;
        }

        const flowRate =
            ((meterValue - Number(oldMeterReading?.val)) * 1000) / ((timestampUnix - Number(oldTimestamp?.val)) / 60);

        await this.setState('data.averageFlowRate', flowRate, true);
        this.log.debug(`Calculated Flow Rate: ${flowRate} L/min`);
    }

    private async setDayHistory(days: number): Promise<void> {
        const historyDays = days - 1;

        for (let c = historyDays; c >= 0; c--) {
            try {
                let state;

                if (c == 0) {
                    state = await this.getStateAsync('data.dailyConsumption');
                } else {
                    state = await this.getStateAsync(`history.consumption_${c}_days_ago`);
                }

                if (state && state.val !== undefined) {
                    const _c = c + 1;
                    await this.setState(`history.consumption_${_c}_days_ago`, state.val, true);
                    this.log.debug(`history consumption ${_c} days ago: ${state.val} m³`);
                }
            } catch (err) {
                this.log.warn(err);
            }
        }
        await this.setState('data.dailyConsumption', 0, true);
    }

    private async delHistoryStates(days: number): Promise<void> {
        const _historyStates = await this.getForeignObjectsAsync(`${this.namespace}.history.*`);

        for (const i in _historyStates) {
            const historyID = _historyStates[i]._id;
            const historyName: string = historyID.split('.').pop() ?? '';
            const parts = historyName.split('_');
            const parsed = parseInt(parts[1], 10);
            const historyNumber: number | undefined = !isNaN(parsed) ? parsed : undefined;

            if (historyNumber !== undefined && historyNumber > days) {
                try {
                    await this.delObjectAsync(historyID);
                    this.log.debug(`Delete old History State "${historyName}"`);
                } catch (e) {
                    this.log.warn(`Cannot Delete old History State "${historyName}"`);
                }
            }
        }
    }

    private async createdHistoryStates(historyDays: number): Promise<void> {
        for (let c = 0; c < historyDays; c++) {
            const _historyDays = c + 1;

            await this.setObjectNotExistsAsync(`history.consumption_${_historyDays}_days_ago`, {
                type: 'state',
                common: {
                    role: 'value.fill',
                    name: `Daily consumption ${_historyDays} days ago`,
                    type: 'number',
                    read: true,
                    write: false,
                    unit: 'm³',
                    def: 0,
                },
                native: {},
            });
        }
    }

    private async validateURL(): Promise<boolean> {
        try {
            const response = await axios.get(this.apiBaseUrl, {
                timeout: 10000,
                validateStatus: () => true,
            });
            if (response && response.status) {
                this.log.debug(`Hydrop API is available ... Status: ${response.status}`);
                await this.setState('info.connection', true, true);
                return true;
            } else {
                this.log.warn('Hydrop API did not return a valid response');
                await this.setState('info.connection', false, true);
                return false;
            }
        } catch (err) {
            this.log.error(`Hydrop API is not available: ${err}`);
            await this.setState('info.connection', false, true);
            return false;
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Hydrop(options);
} else {
    // otherwise start the instance directly
    (() => new Hydrop())();
}

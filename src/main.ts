import * as utils from '@iobroker/adapter-core';
import axios, { type AxiosRequestConfig } from 'axios';
import schedule from 'node-schedule';

class Hydrop extends utils.Adapter {
    private apiBaseUrl: string = 'https://api.hydrop-systems.com';
    private url: string = '';
    private pollInterval: number = 5; // in minutes
    private interval: ioBroker.Interval | undefined;
    private lastMeterReading: number | null = null;
    private meterReading: number = 0;
    private lastTimestampUnix: number | null = null;
    private consumption: number = 0;
    private flowRate: number = 0;
    private timestampUnix: number = 0;
    private apiKey: string = '';
    private meterName: string = '';
    private historyDays: number = 7;
    private dailyConsumption: number = 0;
    private newDailyConsumption: number = 0;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'hydrop',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        this.apiKey = this.config.apiKey || '';
        this.meterName = this.config.meterName || '';
        this.historyDays = this.config.historyDays || 7;
        this.url = `${this.apiBaseUrl}/sensors/ID/${this.meterName}/newest`;

        // Initialize states
        await this.createdHistoryStates();
        await this.delHistoryStates();

        this.log.info('Hydrop adapter started');
        await this.schedulePoll();

        schedule.scheduleJob('dayHistory', '0 0 0 * * *', async () => await this.setDayHistory());
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
        if (this.apiKey === '' || this.meterName === '') {
            this.log.error('API Key or Meter Name not configured. Please check the adapter settings.');
            return;
        }

        await this.poll();
        this.interval = this.setInterval(() => this.poll(), this.pollInterval * 60_000);
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
                url: this.url,
                headers: {
                    apikey: this.apiKey,
                },
                timeout: 10000,
                responseType: 'json',
            });

            if (hydropRequest?.data?.sensors?.[0]?.records?.[0]) {
                const record = hydropRequest.data.sensors[0].records[0];

                this.meterReading = record.meterValue;
                await this.setState('data.meterReading', parseFloat(record.meterValue.toFixed(3)), true);

                this.timestampUnix = record.timestamp;
                await this.setState('data.measurementTime', new Date(this.timestampUnix * 1000).toISOString(), true);

                this.log.debug(
                    `Meter Value: ${record.meterValue} m³ at ${new Date(this.timestampUnix * 1000).toISOString()}`,
                );

                await this.calcData();
            } else {
                this.log.warn('No valid data received from Hydrop API');
            }
        } catch (error) {
            this.log.error(`Polling error: ${error.message}`);
        }
    }

    private async calcData(): Promise<void> {
        // Calculate Consumption
        if (this.lastMeterReading !== null) {
            this.consumption = this.meterReading - this.lastMeterReading;

            if (this.consumption > 0) {
                this.newDailyConsumption = this.dailyConsumption + this.consumption;

                await this.setState('data.dailyConsumption', parseFloat(this.newDailyConsumption.toFixed(3)), true);
                this.dailyConsumption = this.newDailyConsumption;

                this.log.debug(
                    `Calculated Consumption: ${this.consumption} m³, Daily Consumption: ${this.newDailyConsumption} m³`,
                );
            } else {
                this.log.debug('No consumption detected (meter value did not increase)');
            }
        } else {
            this.log.debug('last meter reading not available, skipping consumption calculation');
        }

        // Calculate Flow Rate (L/min)
        if (
            this.lastMeterReading === null ||
            this.lastTimestampUnix === null ||
            this.meterReading === null ||
            this.timestampUnix === null
        ) {
            this.lastMeterReading = this.meterReading ? this.meterReading : null;
            this.lastTimestampUnix = this.timestampUnix ? this.timestampUnix : null;
            this.log.debug('last meter reading or timestamp not available, skipping flow rate calculation');
            return;
        }

        this.flowRate =
            ((this.meterReading - Number(this.lastMeterReading)) * 1000) /
            ((this.timestampUnix - Number(this.lastTimestampUnix)) / 60);

        await this.setState('data.averageFlowRate', parseFloat(this.flowRate.toFixed(3)), true);
        this.log.debug(`Calculated Flow Rate: ${this.flowRate} L/min`);

        this.lastMeterReading = this.meterReading ? this.meterReading : null;
        this.lastTimestampUnix = this.timestampUnix ? this.timestampUnix : null;
    }

    private async setDayHistory(): Promise<void> {
        const historyDays = this.historyDays - 1;

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
        this.dailyConsumption = 0;
        await this.setState('data.dailyConsumption', 0, true);
    }

    private async delHistoryStates(): Promise<void> {
        const _historyStates = await this.getForeignObjectsAsync(`${this.namespace}.history.*`);

        for (const i in _historyStates) {
            const historyID = _historyStates[i]._id;
            const historyName: string = historyID.split('.').pop() ?? '';
            const parts = historyName.split('_');
            const parsed = parseInt(parts[1], 10);
            const historyNumber: number | undefined = !isNaN(parsed) ? parsed : undefined;

            if (historyNumber !== undefined && historyNumber > this.historyDays) {
                try {
                    await this.delObjectAsync(historyID);
                    this.log.debug(`Delete old History State "${historyName}"`);
                } catch (e) {
                    this.log.warn(`Cannot Delete old History State "${historyName}"`);
                }
            }
        }
    }

    private async createdHistoryStates(): Promise<void> {
        for (let c = 0; c < this.historyDays; c++) {
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

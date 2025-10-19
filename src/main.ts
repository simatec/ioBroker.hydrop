import * as utils from '@iobroker/adapter-core';
import axios, { type AxiosRequestConfig } from 'axios';
import schedule from 'node-schedule';

class Hydrop extends utils.Adapter {
	private apiKey: string = this.config.apiKey;
	private meterName: string = this.config.meterName;
	private historyDays: number = this.config.historyDays;
	private interval: ioBroker.Interval | undefined;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'hydrop',
		});
		this.on('ready', this.onReady.bind(this));
		// this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		this.log.info('Hydrop adapter started');

		await this.delHistoryStates(this.historyDays);
		schedule.scheduleJob('dayHistory', '0 0 0 * * *', async () => await this.setDayHistory(this.historyDays));
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 *
	 * @param callback
	 */
	private onUnload(callback: () => void): void {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
			callback();
		}
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
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Hydrop(options);
} else {
	// otherwise start the instance directly
	(() => new Hydrop())();
}

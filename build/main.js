"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_axios = __toESM(require("axios"));
var import_node_schedule = __toESM(require("node-schedule"));
class Hydrop extends utils.Adapter {
  apiBaseUrl = "https://api.hydrop-systems.com";
  pollInterval = 300;
  // in minutes
  interval;
  constructor(options = {}) {
    super({
      ...options,
      name: "hydrop"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    await this.createdHistoryStates(this.config.historyDays);
    await this.delHistoryStates(this.config.historyDays);
    await this.schedulePoll();
    this.log.info("Hydrop adapter started");
    import_node_schedule.default.scheduleJob(
      "dayHistory",
      "0 0 0 * * *",
      async () => await this.setDayHistory(this.config.historyDays)
    );
  }
  onUnload(callback) {
    try {
      this.clearInterval(this.interval);
      import_node_schedule.default.cancelJob("dayHistory");
      callback();
    } catch (e) {
      callback();
    }
  }
  async schedulePoll() {
    if (this.config.apiKey === "" || this.config.meterName === "") {
      this.log.error("API Key or Meter Name not configured. Please check the adapter settings.");
      return;
    }
    await this.poll();
    this.interval = this.setInterval(() => this.poll(), this.pollInterval * 1e3);
  }
  async poll() {
    var _a, _b, _c, _d, _e, _f;
    const available = await this.validateURL();
    if (!available) {
      this.log.error("Hydrop API not available, skipping poll cycle");
      return;
    }
    try {
      const hydropRequest = await (0, import_axios.default)({
        method: "get",
        url: `${this.apiBaseUrl}/sensors/ID/${this.config.meterName}/newest`,
        headers: {
          apikey: this.config.apiKey
        },
        timeout: 1e4,
        responseType: "json"
      });
      if ((_d = (_c = (_b = (_a = hydropRequest == null ? void 0 : hydropRequest.data) == null ? void 0 : _a.sensors) == null ? void 0 : _b[0]) == null ? void 0 : _c.records) == null ? void 0 : _d[0]) {
        const oldMeterReading = (_e = await this.getStateAsync("data.meterReading")) != null ? _e : null;
        const oldTimestamp = (_f = await this.getStateAsync("data.measurementTime")) != null ? _f : null;
        const record = hydropRequest.data.sensors[0].records[0];
        await this.setState("data.meterReading", record.meterValue, true);
        const timestampUnix = record.timestamp;
        await this.setState("data.measurementTime", new Date(timestampUnix * 1e3).toISOString(), true);
        this.log.debug(
          `Meter Value: ${record.meterValue} m\xB3 at ${new Date(timestampUnix * 1e3).toISOString()}`
        );
        await this.calcData(record.meterValue, timestampUnix, oldMeterReading, oldTimestamp);
      } else {
        this.log.warn("No valid data received from Hydrop API");
      }
    } catch (error) {
      this.log.error(`Polling error: ${error.message}`);
    }
  }
  async calcData(meterValue, timestampUnix, oldMeterReading, oldTimestamp) {
    var _a;
    if (oldMeterReading == null ? void 0 : oldMeterReading.val) {
      const consumption = meterValue - Number(oldMeterReading.val);
      if (consumption > 0) {
        const _dailyConsumption = (_a = await this.getStateAsync("data.dailyConsumption")) == null ? void 0 : _a.val;
        const newDailyConsumption = _dailyConsumption + consumption;
        await this.setState("data.dailyConsumption", newDailyConsumption, true);
        this.log.debug(
          `Calculated Consumption: ${consumption} m\xB3, Daily Consumption: ${newDailyConsumption} m\xB3`
        );
      } else {
        this.log.debug("No consumption detected (meter value did not increase)");
      }
    } else {
      this.log.debug("Old meter reading not available, skipping consumption calculation");
    }
    if (!(oldMeterReading == null ? void 0 : oldMeterReading.val) || !(oldTimestamp == null ? void 0 : oldTimestamp.val) || !meterValue || !timestampUnix) {
      this.log.debug("Old meter reading or timestamp not available, skipping flow rate calculation");
      return;
    }
    const flowRate = (meterValue - Number(oldMeterReading == null ? void 0 : oldMeterReading.val)) * 1e3 / ((timestampUnix - Number(oldTimestamp == null ? void 0 : oldTimestamp.val)) / 60);
    await this.setState("data.averageFlowRate", flowRate, true);
    this.log.debug(`Calculated Flow Rate: ${flowRate} L/min`);
  }
  async setDayHistory(days) {
    const historyDays = days - 1;
    for (let c = historyDays; c >= 0; c--) {
      try {
        let state;
        if (c == 0) {
          state = await this.getStateAsync("data.dailyConsumption");
        } else {
          state = await this.getStateAsync(`history.consumption_${c}_days_ago`);
        }
        if (state && state.val !== void 0) {
          const _c = c + 1;
          await this.setState(`history.consumption_${_c}_days_ago`, state.val, true);
          this.log.debug(`history consumption ${_c} days ago: ${state.val} m\xB3`);
        }
      } catch (err) {
        this.log.warn(err);
      }
    }
    await this.setState("data.dailyConsumption", 0, true);
  }
  async delHistoryStates(days) {
    var _a;
    const _historyStates = await this.getForeignObjectsAsync(`${this.namespace}.history.*`);
    for (const i in _historyStates) {
      const historyID = _historyStates[i]._id;
      const historyName = (_a = historyID.split(".").pop()) != null ? _a : "";
      const parts = historyName.split("_");
      const parsed = parseInt(parts[1], 10);
      const historyNumber = !isNaN(parsed) ? parsed : void 0;
      if (historyNumber !== void 0 && historyNumber > days) {
        try {
          await this.delObjectAsync(historyID);
          this.log.debug(`Delete old History State "${historyName}"`);
        } catch (e) {
          this.log.warn(`Cannot Delete old History State "${historyName}"`);
        }
      }
    }
  }
  async createdHistoryStates(historyDays) {
    for (let c = 0; c < historyDays; c++) {
      const _historyDays = c + 1;
      await this.setObjectNotExistsAsync(`history.consumption_${_historyDays}_days_ago`, {
        type: "state",
        common: {
          role: "value.fill",
          name: `Daily consumption ${_historyDays} days ago`,
          type: "number",
          read: true,
          write: false,
          unit: "m\xB3",
          def: 0
        },
        native: {}
      });
    }
  }
  async validateURL() {
    try {
      const response = await import_axios.default.get(this.apiBaseUrl, {
        timeout: 1e4,
        validateStatus: () => true
      });
      if (response && response.status) {
        this.log.debug(`Hydrop API is available ... Status: ${response.status}`);
        await this.setState("info.connection", true, true);
        return true;
      } else {
        this.log.warn("Hydrop API did not return a valid response");
        await this.setState("info.connection", false, true);
        return false;
      }
    } catch (err) {
      this.log.error(`Hydrop API is not available: ${err}`);
      await this.setState("info.connection", false, true);
      return false;
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new Hydrop(options);
} else {
  (() => new Hydrop())();
}
//# sourceMappingURL=main.js.map

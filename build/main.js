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
  pollInterval = 5;
  // in minutes
  interval;
  lastMeterReading = null;
  meterReading = 0;
  lastTimestampUnix = null;
  consumption = 0;
  flowRate = 0;
  timestampUnix = 0;
  apiKey = "";
  meterName = "";
  historyDays = 7;
  dailyConsumption = 0;
  newDailyConsumption = 0;
  constructor(options = {}) {
    super({
      ...options,
      name: "hydrop"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    this.apiKey = this.config.apiKey || "";
    this.meterName = this.config.meterName || "";
    this.historyDays = this.config.historyDays || 7;
    await this.createdHistoryStates();
    await this.delHistoryStates();
    await this.schedulePoll();
    this.log.info("Hydrop adapter started");
    import_node_schedule.default.scheduleJob("dayHistory", "0 0 0 * * *", async () => await this.setDayHistory());
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
    if (this.apiKey === "" || this.meterName === "") {
      this.log.error("API Key or Meter Name not configured. Please check the adapter settings.");
      return;
    }
    await this.poll();
    this.interval = this.setInterval(() => this.poll(), this.pollInterval * 6e4);
  }
  async poll() {
    var _a, _b, _c, _d;
    const available = await this.validateURL();
    if (!available) {
      this.log.error("Hydrop API not available, skipping poll cycle");
      return;
    }
    try {
      const hydropRequest = await (0, import_axios.default)({
        method: "get",
        url: `${this.apiBaseUrl}/sensors/ID/${this.meterName}/newest`,
        headers: {
          apikey: this.apiKey
        },
        timeout: 1e4,
        responseType: "json"
      });
      if ((_d = (_c = (_b = (_a = hydropRequest == null ? void 0 : hydropRequest.data) == null ? void 0 : _a.sensors) == null ? void 0 : _b[0]) == null ? void 0 : _c.records) == null ? void 0 : _d[0]) {
        const record = hydropRequest.data.sensors[0].records[0];
        this.meterReading = record.meterValue;
        await this.setState("data.meterReading", record.meterValue, true);
        this.timestampUnix = record.timestamp;
        await this.setState("data.measurementTime", new Date(this.timestampUnix * 1e3).toISOString(), true);
        this.log.debug(
          `Meter Value: ${record.meterValue} m\xB3 at ${new Date(this.timestampUnix * 1e3).toISOString()}`
        );
        await this.calcData();
      } else {
        this.log.warn("No valid data received from Hydrop API");
      }
    } catch (error) {
      this.log.error(`Polling error: ${error.message}`);
    }
  }
  async calcData() {
    if (this.lastMeterReading !== null) {
      this.consumption = this.meterReading - this.lastMeterReading;
      if (this.consumption > 0) {
        this.newDailyConsumption = this.dailyConsumption + this.consumption;
        await this.setState("data.dailyConsumption", this.newDailyConsumption, true);
        this.dailyConsumption = this.newDailyConsumption;
        this.log.debug(
          `Calculated Consumption: ${this.consumption} m\xB3, Daily Consumption: ${this.newDailyConsumption} m\xB3`
        );
      } else {
        this.log.debug("No consumption detected (meter value did not increase)");
      }
    } else {
      this.log.debug("Old meter reading not available, skipping consumption calculation");
    }
    if (!this.lastMeterReading || !this.lastTimestampUnix || this.meterReading === null || !this.timestampUnix) {
      this.log.debug("Old meter reading or timestamp not available, skipping flow rate calculation");
      return;
    }
    this.flowRate = (this.meterReading - Number(this.lastMeterReading)) * 1e3 / ((this.timestampUnix - Number(this.lastTimestampUnix)) / 60);
    await this.setState("data.averageFlowRate", this.flowRate, true);
    this.log.debug(`Calculated Flow Rate: ${this.flowRate} L/min`);
    this.lastMeterReading = this.meterReading;
    this.lastTimestampUnix = this.timestampUnix;
  }
  async setDayHistory() {
    const historyDays = this.historyDays - 1;
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
  async delHistoryStates() {
    var _a;
    const _historyStates = await this.getForeignObjectsAsync(`${this.namespace}.history.*`);
    for (const i in _historyStates) {
      const historyID = _historyStates[i]._id;
      const historyName = (_a = historyID.split(".").pop()) != null ? _a : "";
      const parts = historyName.split("_");
      const parsed = parseInt(parts[1], 10);
      const historyNumber = !isNaN(parsed) ? parsed : void 0;
      if (historyNumber !== void 0 && historyNumber > this.historyDays) {
        try {
          await this.delObjectAsync(historyID);
          this.log.debug(`Delete old History State "${historyName}"`);
        } catch (e) {
          this.log.warn(`Cannot Delete old History State "${historyName}"`);
        }
      }
    }
  }
  async createdHistoryStates() {
    for (let c = 0; c < this.historyDays; c++) {
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

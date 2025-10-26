![Logo](admin/hydrop.png)
# ioBroker.hydrop

![Number of Installations](http://iobroker.live/badges/hydrop-installed.svg)
![Number of Installations](http://iobroker.live/badges/hydrop-stable.svg)
[![NPM version](http://img.shields.io/npm/v/iobroker.hydrop.svg)](https://www.npmjs.com/package/iobroker.hydrop)
[![Downloads](https://img.shields.io/npm/dm/iobroker.hydrop.svg)](https://www.npmjs.com/package/iobroker.hydrop)
[![Known Vulnerabilities](https://snyk.io/test/github/simatec/ioBroker.hydrop/badge.svg)](https://snyk.io/test/github/simatec/ioBroker.hydrop)
![Test and Release](https://github.com/simatec/ioBroker.hydrop/workflows/Test%20and%20Release/badge.svg)

[![License](https://img.shields.io/github/license/simatec/ioBroker.hydrop?style=flat)](https://github.com/simatec/ioBroker.hydrop/blob/master/LICENSE)
[![Donate](https://img.shields.io/badge/paypal-donate%20|%20spenden-blue.svg)](https://paypal.me/mk1676)
[![](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/simatec)

[![NPM](https://nodei.co/npm/iobroker.hydrop.png?downloads=true)](https://nodei.co/npm/iobroker.hydrop/)

This adapter uses the service `Sentry.io` to automatically report exceptions and code errors and new device schemas to me as the developer. More details see below!

*****

## Support adapter development
**If you like `ioBroker.hydrop`, please consider making a donation:**
  
[![paypal](https://www.paypalobjects.com/en_US/DK/i/btn/btn_donateCC_LG.gif)](https://paypal.me/mk1676)


*****

### What is Sentry.io and what is reported to the servers of that company?
Sentry.io is a service for developers to get an overview about errors from their applications. And exactly this is implemented in this adapter.

When the adapter crashes or an other Code error happens, this error message that also appears in the ioBroker log is submitted to Sentry. When you allowed iobroker GmbH to collect diagnostic data then also your installation ID (this is just a unique ID **without** any additional infos about you, email, name or such) is included. This allows Sentry to group errors and show how many unique users are affected by such an error. All of this helps me to provide error free adapters that basically never crashs.


*****

## hydrop adapter for ioBroker

To integrate your hydropmeter into ioBroker, you will need the following: 

* An account in the hydrop app (available for Android and iOS)
* The name you gave your hydropmeter in the app
* Your personal API key for the hydrop REST API

If you do not yet have an API key, please send a request by email to support@hydrop-systems.com

Once you have all the information ready, you can get started. 
Data is queried in IOBroker every 5 minutes.


*****

## Changelog
<!-- ### **WORK IN PROGRESS** -->
### **WORK IN PROGRESS**
* (simatec) Fix daily Consumption

### 0.0.4 (2025-10-23)
* (simatec) many small fixes

### 0.0.3 (2025-10-21)
* (simatec) Trusted Publisher added
* (simatec) Source code improved
* (simatec) Readme added

### 0.0.2 (2025-10-19)
* (simatec) initial release

*****

## License
MIT License

Copyright (c) 2025 simatec

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

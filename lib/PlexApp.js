'use strict';

const Homey = require('homey');

module.exports = class PlexApp extends Homey.App {

  async onInit() {
    this.homey.dashboards
      .getWidget('recently-added')
      .registerSettingAutocompleteListener('server', async (query, settings) => {
        const driver = await this.homey.drivers.getDriver('pms');
        const devices = await driver.getDevices();

        return Object.values(devices)
          .map(device => ({
            machineIdentifier: device.getData().machineIdentifier,
            name: device.getName(),
          }))
          .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
      });
  }

};

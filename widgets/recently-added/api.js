'use strict';

module.exports = {
  async getRecentlyAdded({ homey, query }) {
    const { serverMachineIdentifier } = query;
    if (!serverMachineIdentifier) {
      throw new Error('Missing serverMachineIdentifier');
    }

    const driver = await homey.drivers.getDriver('pms');
    const device = driver.getDevices().find(device => device.getData().machineIdentifier === serverMachineIdentifier);
    if (!device) {
      throw new Error('Device Not Found');
    }

    return device.getLibraryRecentlyAdded();
  },
};

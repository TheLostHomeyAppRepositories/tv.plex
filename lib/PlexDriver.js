'use strict';

const Homey = require('homey');

const PlexAPI = require('./PlexAPI');
const PlexUtil = require('./PlexUtil');

module.exports = class PlexDriver extends Homey.Driver {

  async onPair(socket) {
    const clientId = PlexUtil.uuid();
    let checkPINInterval;
    let checkPINTimeout;
    let token;

    socket.setHandler('auth', async () => {
      const {
        id: pinId,
        code,
      } = await PlexAPI.createPIN({ clientId });

      checkPINInterval = this.homey.setInterval(() => {
        PlexAPI.checkPIN({
          clientId,
          pinId,
        })
          .then(({ authToken }) => {
            if (authToken) {
              token = authToken;
              this.homey.clearInterval(checkPINInterval);
              this.homey.clearTimeout(checkPINTimeout);

              this.log(`Got Token: ${token}`);

              socket.emit('auth_success').catch(this.error);
            }
          })
          .catch(err => {
            this.error('Check PIN Error:', err);
          });
      }, 1000);

      checkPINTimeout = this.homey.setTimeout(() => {
        socket.emit('auth_error', 'Timeout receiving Plex Token').catch(this.error);
      }, 1000 * 60);

      const url = `https://app.plex.tv/auth#?clientID=${clientId}&code=${code}&context%5Bdevice%5D%5Bproduct%5D=Homey`;
      return { url };
    });

    socket.setHandler('disconnect', () => {
      if (checkPINInterval) {
        this.homey.clearInterval(checkPINInterval);
      }

      if (checkPINTimeout) {
        this.homey.clearTimeout(checkPINTimeout);
      }
    });

    socket.setHandler('list_devices', async () => {
      if (!token) {
        throw new Error('Missing Plex Token');
      }

      const api = new PlexAPI({
        homey: this.homey,
        token,
      });
      const servers = await api.getServers();

      return servers.map(server => ({
        name: server.name,
        data: {
          machineIdentifier: server.clientIdentifier,
        },
        store: {
          clientId,
          token: server.accessToken,
        },
      }));
    });
  }

  async onRepair(socket, device) {
    const clientId = PlexUtil.uuid();
    let checkPINInterval;
    let checkPINTimeout;
    let token;

    socket.setHandler('auth', async () => {
      const {
        id: pinId,
        code,
      } = await PlexAPI.createPIN({ clientId });

      checkPINInterval = this.homey.setInterval(() => {
        PlexAPI.checkPIN({
          clientId,
          pinId,
        })
          .then(async ({ authToken }) => {
            if (authToken) {
              token = authToken;
              this.homey.clearInterval(checkPINInterval);
              this.homey.clearTimeout(checkPINTimeout);

              this.log(`Got Token: ${token}`);

              socket.emit('auth_success');

              Promise.resolve().then(async () => {
                await device.setStoreValue('token', token);
                await device.setStoreValue('clientId', clientId);
                await PlexUtil.wait(2000);
                await device.onInitPlexAPI();
                device.poll();
              }).catch(err => {
                socket.emit('auth_error', err.message || err.toString()).catch(this.error);
              });
            }
          })
          .catch(err => {
            this.error('Check PIN Error:', err);
          });
      }, 1000);

      checkPINTimeout = this.homey.setTimeout(() => {
        socket.emit('auth_error', 'Timeout receiving Plex Token').catch(this.error);
      }, 1000 * 60);

      const url = `https://app.plex.tv/auth#?clientID=${clientId}&code=${code}&context%5Bdevice%5D%5Bproduct%5D=Homey`;
      return { url };
    });

    socket.setHandler('disconnect', () => {
      if (checkPINInterval) {
        this.homey.clearInterval(checkPINInterval);
      }

      if (checkPINTimeout) {
        this.homey.clearTimeout(checkPINTimeout);
      }
    });
  }

};

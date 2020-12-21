'use strict';

const { URLSearchParams } = require('url');

const xml = require('xml2js');

const PlexUtil = require('./PlexUtil');
const PlexError = require('./PlexError');

module.exports = class PlexAPI {

  /*
   * Static Methods
   */

  static async createPIN({
    clientId,
  } = {}) {
    if (!clientId) {
      throw new PlexError('Missing Client ID');
    }

    const body = new URLSearchParams();
    body.append('strong', 'true');

    const res = await PlexUtil.fetch({
      body,
      url: 'https://plex.tv/api/v2/pins',
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Plex-Product': 'Homey',
        'X-Plex-Client-Identifier': clientId,
      },
    });
    const resJSON = await res.json();

    if (!res.ok) {
      throw new PlexError(resJSON.error || res.statusText);
    }

    return resJSON;
  }

  static async checkPIN({
    clientId,
    pinId,
  }) {
    if (!clientId) {
      throw new PlexError('Missing Client ID');
    }

    if (!pinId) {
      throw new PlexError('Missing PIN ID');
    }

    const res = await PlexUtil.fetch({
      url: `https://plex.tv/api/v2/pins/${pinId}`,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Plex-Client-Identifier': clientId,
      },
    });
    const resJSON = await res.json();

    if (!res.ok) {
      throw new PlexError(resJSON.error || res.statusText);
    }

    return resJSON;
  }

  /*
   * Instance Methods
   */

  constructor({
    homey,
    token,
    machineIdentifier,
  } = {}) {
    this.homey = homey;
    this.token = token;
    this.machineIdentifier = machineIdentifier;

    this.url = null;
  }

  async requireToken() {
    if (!this.token) {
      throw new PlexError('No Plex Token Provided');
    }
  }

  async requireIP() {
    await this.requireToken();

    if (!this.url) {
      this.url = Promise.resolve().then(async () => {
        this.homey.log('[PlexAPI]', 'Finding URL...');

        const servers = await this.getServers();
        const server = servers.find(server => server.machineIdentifier === this.machineIdentifier);
        if (!server) {
          throw new PlexError('Plex Media Server Unavailable');
        }

        const localURL = `${server.scheme}://${server.localAddresses}:${server.port}`;
        const cloudURL = `${server.scheme}://${server.address}:${server.port}`;

        // Try Local
        try {
          const res = await PlexUtil.fetch({
            url: `${localURL}/system`,
            headers: {
              'X-Plex-Token': this.token,
            },
          });
          if (res.status !== 200) {
            throw new Error('Plex Not Reachable (Local)');
          }

          return localURL;
        } catch (err) {
          this.homey.log('[PlexAPI]', 'Local URL not working, testing Cloud URL...');

          // Try Cloud
          try {
            const res = await PlexUtil.fetch({
              url: `${cloudURL}/system`,
              headers: {
                'X-Plex-Token': this.token,
              },
            });
            if (res.status !== 200) {
              throw new Error('Plex Not Reachable (Cloud)');
            }

            return cloudURL;
          } catch (err) {
            this.homey.log('[PlexAPI]', 'Cloud URL not working.');
            throw new PlexError('Plex Media Server Unavailable');
          }
        }
      });

      // eslint-disable-next-line no-console
      this.url
        .then(url => this.homey.log('[PlexAPI]', `Got URL: ${url}`))
        .catch(err => {
          this.homey.error('[PlexAPI]', err);
          this.url = null;
        });
    }

    return this.url;
  }

  /*
   * Plex Cloud API
   */

  async getServers() {
    await this.requireToken();

    const res = await PlexUtil.fetch({
      url: 'https://plex.tv/pms/servers',
      headers: {
        'X-Plex-Token': this.token,
      },
    });
    const resText = await res.text();
    const resXML = await xml.parseStringPromise(resText);

    if (!resXML['MediaContainer']
     || !resXML['MediaContainer']['Server']) {
      return [];
    }

    return resXML['MediaContainer']['Server'].map(server => ({
      ...server['$'],
    }));
  }

  /*
   * Plex Local API
   */

  async call({
    method,
    path,
  }) {
    await this.requireToken();
    await this.requireIP();

    const url = await this.url;
    const res = await PlexUtil.fetch({
      method,
      url: `${url}${path}`,
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': this.token,
      },
    }).catch(err => {
      this.homey.error('[PlexAPI]', err.message || err.toString());
      this.homey.error('[PlexAPI]', 'Resetting URL...');
      this.url = null;
      throw err;
    });

    if (res.status === 204) return undefined;
    if (res.headers.get('Content-Type') !== 'application/json') return undefined;

    const resJSON = await res.json();

    if (!res.ok) {
      throw new PlexError(resJSON.error || res.statusText);
    }

    return resJSON;
  }

  async getLibraryRecentlyAdded() {
    const { MediaContainer } = await this.call({
      method: 'get',
      path: '/library/recentlyAdded',
    });

    if (!MediaContainer || !MediaContainer.Metadata) {
      return [];
    }

    return MediaContainer.Metadata;
  }

  async getSessions() {
    const { MediaContainer } = await this.call({
      method: 'get',
      path: '/status/sessions',
    });

    if (!MediaContainer || !MediaContainer.Metadata) {
      return [];
    }

    return MediaContainer.Metadata;
  }

  async getLibrarySections() {
    const { MediaContainer } = await this.call({
      method: 'get',
      path: '/library/sections',
    });

    if (!MediaContainer || !MediaContainer.Directory) {
      return [];
    }

    return MediaContainer.Directory;
  }

  async rescanLibrary({ key }) {
    return this.call({
      method: 'get',
      path: `/library/sections/${key}/refresh`,
    });
  }

  async refreshLibrary({ key }) {
    return this.call({
      method: 'get',
      path: `/library/sections/${key}/refresh?force=1`,
    });
  }

};

'use strict';

const { URLSearchParams } = require('url');

const fetch = require('node-fetch');
const xml = require('xml2js');

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

    const res = await fetch('https://plex.tv/api/v2/pins', {
      body,
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

    const res = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
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
    token,
    machineIdentifier,
  } = {}) {
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
    if (!this.url) {
      const servers = await this.getServers();
      const server = servers.find(server => server.machineIdentifier === this.machineIdentifier);
      if (!server) {
        throw new PlexError('Plex Server Not In Account Anymore');
      }

      // TODO: Test if reachable locally

      this.url = `${server.scheme}://${server.localAddresses}:${server.port}`;
    }
  }

  /*
   * Plex Cloud API
   */

  async getServers() {
    await this.requireToken();

    const res = await fetch('https://plex.tv/pms/servers', {
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

    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': this.token,
      },
    });

    if (res.status === 204) return undefined;

    const resJSON = await res.json();

    if (!res.ok) {
      throw new PlexError(resJSON.error || res.statusText);
    }

    return resJSON;
  }

  async getLibraryRecentlyAdded() {
    return this.call({
      method: 'get',
      path: '/library/recentlyAdded',
    });
  }

  async getSessions() {
    const { MediaContainer } = await this.call({
      method: 'get',
      path: '/status/sessions',
    });

    if (!MediaContainer.Metadata) {
      return [];
    }

    return MediaContainer.Metadata;
  }

};

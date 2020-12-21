'use strict';

const { URLSearchParams } = require('url');

const fetch = require('node-fetch');
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
    token = null,
  } = {}) {
    this.token = token;
  }

  requireToken() {
    if (!this.token) {
      throw new PlexError('No Plex Token Provided');
    }
  }

  async getServers() {
    this.requireToken();

    const res = await fetch('https://plex.tv/pms/servers', {
      headers: {
        'X-Plex-Token': this.token,
      },
    });
    const resText = await res.text();
    const resXML = await xml.parseStringPromise(resText);
    return resXML['MediaContainer']['Server'].map(server => ({
      ...server['$'],
    }));
  }

};

'use strict';

const fetch = require('node-fetch');

module.exports = class PlexUtil {

  static uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; const
        v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  static async fetch({
    url,
    timeout = 5000,
    ...props
  }) {
    let timeoutRef;
    return Promise.race([
      fetch(url, props),
      new Promise((_, reject) => {
        timeoutRef = setTimeout(() => {
          reject(new Error(`Plex Timeout after ${timeout / 1000}s`));
        }, timeout);
      }),
    ]).finally(() => {
      clearTimeout(timeoutRef);
    });
  }

  static async wait(timeout) {
    await new Promise(resolve => {
      setTimeout(resolve, timeout);
    });
  }

};

'use strict';

const fetch = require('node-fetch');

module.exports = class PlexUtil {

  static getThumb(item) {
    if (item.grandparentThumb) {
      return item.grandparentThumb;
    }

    if (item.parentThumb) {
      return item.parentThumb;
    }

    if (item.thumb) {
      return item.thumb;
    }

    return null;
  }

  static getTitle(item) {
    const parts = [];

    if (item.grandparentTitle) {
      parts.push(item.grandparentTitle);
    }

    if (item.parentTitle) {
      parts.push(item.parentTitle);
    }

    if (item.title) {
      parts.push(item.title);
    }

    if (parts.length) {
      return parts.join(' - ');
    }

    return null;
  }

  static uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; const
        v = c === 'x' ? r : ((r & 0x3) | 0x8);
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

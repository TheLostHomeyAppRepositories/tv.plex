'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');

const PlexAPI = require('./PlexAPI');

module.exports = class PlexDevice extends Homey.Device {

  static POLL_INTERVAL = 1000 * 10;

  async onInit() {
    const { machineIdentifier } = this.getData();
    const { token } = this.getStore();

    this.api = new PlexAPI({
      token,
      machineIdentifier,
    });

    this.pollInterval = setInterval(() => this.poll(), this.constructor.POLL_INTERVAL);
    this.poll();

    this.image = await this.homey.images.createImage();
    this.image.setUrl(null);
    await this.setAlbumArtImage(this.image);

    this.sessionImage = null;
  }

  poll() {
    // Get Sessions
    this.api.getSessions()
      .then(sessions => {
        const [session] = sessions;

        if (session) {
          // Set Capabilities
          this.setCapabilityValue('speaker_track', session.title || null).catch(this.error);
          this.setCapabilityValue('speaker_artist', session.grandparentTitle || null).catch(this.error);
          this.setCapabilityValue('speaker_album', session.parentTitle || null).catch(this.error);

          const thumb = session.parentThumb
            ? session.parentThumb
            : session.thumb;

          // Set Image
          if (this.sessionImage !== thumb) {
            // Create the Image URL
            this.sessionImage = `${this.api.url}${thumb}?X-Plex-Token=${this.api.token}`;

            // Register the Image
            if (this.sessionImage.startsWith('https:')) {
              this.image.setUrl(this.sessionImage);
            } else {
              this.image.setStream(async stream => {
                const res = await fetch(this.sessionImage);
                return res.body.pipe(stream);
              });
            }

            this.image.update().catch(this.error);
          }
        } else {
          // Set Capabilities
          this.setCapabilityValue('speaker_track', null).catch(this.error);
          this.setCapabilityValue('speaker_artist', null).catch(this.error);
          this.setCapabilityValue('speaker_album', null).catch(this.error);

          // Set Image
          if (this.sessionImage !== null) {
            this.sessionImage = null;
            this.image.setUrl(null);
            this.image.update().catch(this.error);
          }
        }
      })
      .then(() => {
        this.setAvailable();
      })
      .catch(err => {
        this.error(err);
        this.setUnavailable(err);
      });

    // Get Recently Added
    this.api.getLibraryRecentlyAdded()
      .then(items => {
        const previouslyMostRecentlyAddedAt = this.getStoreValue('mostRecentlyAddedAt');
        const mostRecentItem = items[0];
        if (!mostRecentItem) return;
        const mostRecentItemAddedAt = mostRecentItem.addedAt;

        // If nothing has changed
        if (previouslyMostRecentlyAddedAt === mostRecentItemAddedAt) {
          return;
        }

        // Set the new value
        this.setStoreValue('mostRecentlyAddedAt', mostRecentItemAddedAt).catch(this.error);

        // If this is the first time, stop here.
        // We don't want all existing items to be trigger as 'new'.
        if (previouslyMostRecentlyAddedAt === null) {
          return;
        }

        // Loop new items
        items
          .filter(item => {
            return item.addedAt > previouslyMostRecentlyAddedAt;
          })
          .forEach((item, i) => {
            const title = item.parentTitle
              ? `${item.parentTitle} - ${item.title}`
              : item.title;

            this.log(`Added: ${title}`);

            // Set Timeout to prevent Flow Rate Limits
            setTimeout(() => {
              this.homey.flow.getDeviceTriggerCard('recently_added')
                .trigger(this, { title })
                .catch(this.error);
            }, i * 2000);
          });
      })
      .catch(this.error);
  }

  async onDeleted() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  async rescanLibrary({ key }) {
    await this.api.rescanLibrary({ key });
  }

  async refreshLibrary({ key }) {
    await this.api.refreshLibrary({ key });
  }

  async getLibrarySections() {
    return this.api.getLibrarySections();
  }

};

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
          this.setCapabilityValue('speaker_track', session.title).catch(this.error);
          this.setCapabilityValue('speaker_artist', session.grandparentTitle).catch(this.error);
          this.setCapabilityValue('speaker_album', session.parentTitle).catch(this.error);

          // Set Image
          if (this.sessionImage !== session.parentThumb) {
            this.sessionImage = `${this.api.url}${session.parentThumb}?X-Plex-Token=${this.api.token}`;
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
        const previouslyMostRecentlyAdded = this.getStoreValue('mostRecentlyAdded');
        console.log('previouslyMostRecentlyAdded', previouslyMostRecentlyAdded);

        const mostRecentItem = items[0];
        console.log('mostRecentItem', mostRecentItem.key);

        // addedAt

        // If this is the first time
        if (previouslyMostRecentlyAdded === null) {
          this.setStoreValue('mostRecentlyAdded', mostRecentItem.key).catch(this.error);
          return;
        }

        // If nothing has changed
        if (this.getStoreValue('mostRecentlyAdded') === mostRecentItem.key) {
          return;
        }

        // Loop items until the last known is found
        for (const item of Object.values(items)) {
          this.homey.flow.getDeviceTriggerCard('recently_added')
            .trigger(this, {
              title: item.title,
            })
            .catch(this.error);

          // If this is the last items
          if (item.key === this.getStoreValue('mostRecentlyAdded')) {
            this.setStoreValue('mostRecentlyAdded', mostRecentItem.key).catch(this.error);
            return;
          }
        }
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

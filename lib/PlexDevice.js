'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');

const PlexAPI = require('./PlexAPI');
const PlexUtil = require('./PlexUtil');

module.exports = class PlexDevice extends Homey.Device {

  static POLL_INTERVAL = 1000 * 30;

  async onInit() {
    await this.onInitPlexAPI();

    this.pollInterval = setInterval(() => this.poll(), this.constructor.POLL_INTERVAL);
    this.poll();

    this.image = await this.homey.images.createImage();
    this.image.setUrl(null);
    await this.setAlbumArtImage(this.image);

    this.sessionImage = null;
  }

  async onInitPlexAPI() {
    const { machineIdentifier } = this.getData();
    const { token } = this.getStore();

    this.api = new PlexAPI({
      homey: this.homey,
      token,
      machineIdentifier,
    });

    this.api.connect().catch(this.error);
    this.api.on('message', message => {
      this.onMessage(message).catch(this.error);
    });
  }

  async onDeleted() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  async onMessage(message) {
    this.log('onMessage', message);

    switch (message.type) {
      case 'playing':
        await this.onMessagePlaying(message['PlaySessionStateNotification'][0]);
        break;
      default:
        break;
    }
  }

  async onMessagePlaying({ sessionKey, key, state }) {
    const session = await this.api.getSessionCached({ sessionKey });
    switch (state) {
      case 'playing': {
        await this.homey.flow.getDeviceTriggerCard('player_start')
          .trigger(this, {
            playerTitle: session['Player']['title'],
            mediaTitle: PlexUtil.getTitle(session),
          });
        break;
      }
      case 'paused': {
        await this.homey.flow.getDeviceTriggerCard('player_pause')
          .trigger(this, {
            playerTitle: session['Player']['title'],
            mediaTitle: PlexUtil.getTitle(session),
          });
        break;
      }
      case 'stopped': {
        await this.homey.flow.getDeviceTriggerCard('player_stop')
          .trigger(this, {
            playerTitle: session['Player']['title'],
            mediaTitle: PlexUtil.getTitle(session),
          });
        break;
      }
      default:
        break;
    }
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

          const thumb = PlexUtil.getThumb(session);

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
        this.error(err.message || err.toString());
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
            const title = PlexUtil.getTitle(item);

            this.log(`Added: ${title}`);

            // Set Timeout to prevent Flow Rate Limits
            setTimeout(() => {
              this.homey.flow.getDeviceTriggerCard('recently_added')
                .trigger(this, { title })
                .catch(this.error);
            }, i * 2000);
          });
      })
      .catch(err => {
        this.error(err.message || err.toString());
      });
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

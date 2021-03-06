//@flow
import EventManager from '../../../../event/event-manager'
import {HTML5_EVENTS as Html5Events} from '../../../../event/events'
import Track from '../../../../track/track'
import VideoTrack from '../../../../track/video-track'
import AudioTrack from '../../../../track/audio-track'
import {TextTrack as PKTextTrack} from '../../../../track/text-track'
import BaseMediaSourceAdapter from '../base-media-source-adapter'
import {getSuitableSourceForResolution} from '../../../../utils/resolution'
import * as Utils from '../../../../utils/util'
import FairPlay from '../../../../drm/fairplay'
import Env from '../../../../utils/env'

/**
 * An illustration of media source extension for progressive download
 * @classdesc
 * @implements {IMediaSourceAdapter}
 */
export default class NativeAdapter extends BaseMediaSourceAdapter {
  /**
   * The id of the Adapter
   * @member {string} id
   * @static
   * @public
   */
  static id: string = 'NativeAdapter';

  /**
   * The adapter logger
   * @member {any} _logger
   * @private
   * @static
   */
  static _logger = BaseMediaSourceAdapter.getLogger(NativeAdapter.id);
  /**
   * static video element for canPlayType testing
   * @member {} TEST_VIDEO
   * @type {HTMLVideoElement}
   * @static
   */
  static TEST_VIDEO: HTMLVideoElement = Utils.Dom.createElement("video");
  /**
   * The DRM protocols implementations for native adapter.
   * @type {Array<Function>}
   * @private
   * @static
   */
  static _drmProtocols: Array<Function> = [FairPlay];
  /**
   * The DRM protocol for the current playback.
   * @type {?Function}
   * @private
   * @static
   */
  static _drmProtocol: ?Function = null;
  /**
   * The event manager of the class.
   * @member {EventManager} - _eventManager
   * @type {EventManager}
   * @private
   */
  _eventManager: EventManager;
  /**
   * The load promise
   * @member {Promise<Object>} - _loadPromise
   * @type {Promise<Object>}
   * @private
   */
  _loadPromise: ?Promise<Object>;
  /**
   * The original progressive sources
   * @member {Array<Object>} - _progressiveSources
   * @private
   */
  _progressiveSources: Array<Source>;

  /**
   * Checks if NativeAdapter can play a given mime type.
   * @function canPlayType
   * @param {string} mimeType - The mime type to check
   * @param {boolean} [preferNative=true] - prefer native flag
   * @returns {boolean} - Whether the native adapter can play a specific mime type
   * @static
   */
  static canPlayType(mimeType: string, preferNative: boolean = true): boolean {
    let canPlayType = false;
    if (typeof mimeType === 'string') {
      canPlayType = !!(NativeAdapter.TEST_VIDEO.canPlayType(mimeType.toLowerCase())) && !!preferNative;
    }
    NativeAdapter._logger.debug('canPlayType result for mimeType:' + mimeType + ' is ' + canPlayType.toString());
    return canPlayType;
  }

  /**
   * Checks if NativeAdapter can play a given drm data.
   * @function canPlayDrm
   * @param {Array<Object>} drmData - The drm data to check.
   * @returns {boolean} - Whether the native adapter can play a specific drm data.
   * @static
   */
  static canPlayDrm(drmData: Array<Object>): boolean {
    let canPlayDrm = false;
    for (let drmProtocol of NativeAdapter._drmProtocols) {
      if (drmProtocol.canPlayDrm(drmData)) {
        NativeAdapter._drmProtocol = drmProtocol;
        canPlayDrm = true;
        break;
      }
    }
    NativeAdapter._logger.debug('canPlayDrm result is ' + canPlayDrm.toString(), drmData);
    return canPlayDrm;
  }

  /**
   * Factory method to create media source adapter.
   * @function createAdapter
   * @param {HTMLVideoElement} videoElement - The video element that the media source adapter work with.
   * @param {Object} source - The source Object.
   * @param {Object} config - The player configuration.
   * @returns {IMediaSourceAdapter} - New instance of the run time media source adapter.
   * @static
   */
  static createAdapter(videoElement: HTMLVideoElement, source: Source, config: Object): IMediaSourceAdapter {
    return new this(videoElement, source, config);
  }

  /**
   * @constructor
   * @param {HTMLVideoElement} videoElement - The video element which bind to NativeAdapter
   * @param {Source} source - The source object
   * @param {Object} config - The player configuration
   */
  constructor(videoElement: HTMLVideoElement, source: Source, config: Object) {
    NativeAdapter._logger.debug('Creating adapter');
    super(videoElement, source);
    this._maybeSetDrmPlayback();
    this._eventManager = new EventManager();
    this._progressiveSources = config.sources.progressive;
  }

  /**
   * Sets the DRM playback in case such needed.
   * @private
   * @returns {void}
   */
  _maybeSetDrmPlayback(): void {
    if (NativeAdapter._drmProtocol && this._sourceObj && this._sourceObj.drmData) {
      NativeAdapter._drmProtocol.setDrmPlayback(this._videoElement, this._sourceObj.drmData);
    }
  }

  /**
   * Set the suitable progressive source according the current resolution
   * @function _setProgressiveSource
   * @returns {void}
   * @private
   */
  _setProgressiveSource(): void {
    let suitableTrack = getSuitableSourceForResolution(this._progressiveSources, this._videoElement.offsetWidth, this._videoElement.offsetHeight);
    if (suitableTrack) {
      this._sourceObj = suitableTrack;
    }
  }

  /**
   * Checks if the playback source is progressive
   * @function _isProgressivePlayback
   * @returns {boolean} - is progressive source
   * @private
   */
  _isProgressivePlayback(): boolean {
    return this._sourceObj ? this._sourceObj.mimetype === 'video/mp4' : false;
  }

  /**
   * Load the video source
   * @param {number} startTime - Optional time to start the video from.
   * @function load
   * @returns {Promise<Object>} - The loaded data
   */
  load(startTime: ?number): Promise<Object> {
    if (!this._loadPromise) {
      this._loadPromise = new Promise((resolve, reject) => {
        // We're using 'loadeddata' event for native hls (on 'loadedmetadata' native hls doesn't have tracks yet).
        this._eventManager.listenOnce(this._videoElement, Html5Events.LOADED_DATA, () => {
          let data = {tracks: this._getParsedTracks()};
          NativeAdapter._logger.debug('The source has been loaded successfully');
          resolve(data);
        });
        this._eventManager.listenOnce(this._videoElement, Html5Events.ERROR, (error) => {
          NativeAdapter._logger.error(error);
          reject(error);
        });
        if (this._isProgressivePlayback()) {
          this._setProgressiveSource();
        }
        if (this._sourceObj && this._sourceObj.url) {
          this._videoElement.src = this._sourceObj.url;
          this._trigger(BaseMediaSourceAdapter.CustomEvents.ABR_MODE_CHANGED, {mode: this._isProgressivePlayback() ? 'manual' : 'auto'});
        }
        if (startTime) {
          this._videoElement.currentTime = startTime;
        }
        this._videoElement.load();
      });
    }
    return this._loadPromise;
  }

  /**
   * Destroys the native adapter.
   * @function destroy
   * @returns {void}
   */
  destroy(): void {
    NativeAdapter._logger.debug('destroy');
    super.destroy();
    this._eventManager.destroy();
    this._loadPromise = null;
    this._progressiveSources = [];
    if (NativeAdapter._drmProtocol) {
      NativeAdapter._drmProtocol.destroy();
      NativeAdapter._drmProtocol = null;
    }
  }

  /**
   * Get the parsed tracks
   * @function _getParsedTracks
   * @returns {Array<Track>} - The parsed tracks
   * @private
   */
  _getParsedTracks(): Array<Track> {
    let videoTracks = this._getParsedVideoTracks();
    let audioTracks = this._getParsedAudioTracks();
    let textTracks = this._getParsedTextTracks();
    return videoTracks.concat(audioTracks).concat(textTracks);
  }

  /**
   * Get the parsed video tracks
   * @function _getParsedVideoTracks
   * @returns {Array<Track>} - The parsed video tracks
   * @private
   */
  _getParsedVideoTracks(): Array<Track> {
    if (this._isProgressivePlayback()) {
      return this._getParsedProgressiveVideoTracks();
    } else {
      return this._getParsedAdaptiveVideoTracks();
    }
  }

  /**
   * Get the parsed progressive video tracks
   * @function _getParsedProgressiveVideoTracks
   * @returns {Array<Track>} - The parsed progressive video tracks
   * @private
   */
  _getParsedProgressiveVideoTracks(): Array<Track> {
    let videoTracks = this._progressiveSources;
    let parsedTracks = [];
    if (videoTracks) {
      for (let i = 0; i < videoTracks.length; i++) {
        let settings = {
          id: videoTracks[i].id,
          bandwidth: videoTracks[i].bandwidth,
          width: videoTracks[i].width,
          height: videoTracks[i].height,
          active: this._sourceObj ? videoTracks[i].id === this._sourceObj.id : false,
          index: i
        };
        parsedTracks.push(new VideoTrack(settings));
      }
    }
    return parsedTracks;
  }

  /**
   * Get the parsed adaptive video tracks
   * @function _getParsedAdaptiveVideoTracks
   * @returns {Array<Track>} - The parsed adaptive video tracks
   * @private
   */
  _getParsedAdaptiveVideoTracks(): Array<Track> {
    //TODO check adaptation in safari hls
    let videoTracks = this._videoElement.videoTracks;
    let parsedTracks = [];
    if (videoTracks) {
      for (let i = 0; i < videoTracks.length; i++) {
        let settings = {
          //TODO calculate width/height/bandwidth
          id: videoTracks[i].id,
          active: videoTracks[i].selected,
          label: videoTracks[i].label,
          language: videoTracks[i].language,
          index: i
        };
        parsedTracks.push(new VideoTrack(settings));
      }
    }
    return parsedTracks;
  }

  /**
   * Get the parsed audio tracks
   * @function _getParsedAudioTracks
   * @returns {Array<Track>} - The parsed audio tracks
   * @private
   */
  _getParsedAudioTracks(): Array<Track> {
    let audioTracks = this._videoElement.audioTracks;
    let parsedTracks = [];
    if (audioTracks) {
      for (let i = 0; i < audioTracks.length; i++) {
        let settings = {
          id: audioTracks[i].id,
          active: audioTracks[i].enabled,
          label: audioTracks[i].label,
          language: audioTracks[i].language,
          index: i
        };
        parsedTracks.push(new AudioTrack(settings));
      }
    }
    return parsedTracks;
  }

  /**
   * Get the parsed text tracks
   * @function _getParsedTextTracks
   * @returns {Array<Track>} - The parsed text tracks
   * @private
   */
  _getParsedTextTracks(): Array<Track> {
    let textTracks = this._videoElement.textTracks;
    let parsedTracks = [];
    if (textTracks) {
      for (let i = 0; i < textTracks.length; i++) {
        let settings = {
          kind: textTracks[i].kind,
          active: textTracks[i].mode === 'showing',
          label: textTracks[i].label,
          language: textTracks[i].language,
          index: i
        };
        parsedTracks.push(new PKTextTrack(settings));
      }
    }
    return parsedTracks;
  }

  /**
   * Select a video track
   * @function selectVideoTrack
   * @param {VideoTrack} videoTrack - the track to select
   * @returns {void}
   * @public
   */
  selectVideoTrack(videoTrack: VideoTrack): void {
    if (this._isProgressivePlayback()) {
      this._selectProgressiveVideoTrack(videoTrack);
    } else {
      this.selectAdaptiveVideoTrack(videoTrack);
    }
  }

  /**
   * Select a progressive video track
   * @function _selectProgressiveVideoTrack
   * @param {VideoTrack} videoTrack - the track to select
   * @returns {void}
   * @public
   */
  _selectProgressiveVideoTrack(videoTrack: VideoTrack): void {
    let videoTracks = this._progressiveSources;
    if ((videoTrack instanceof VideoTrack) && videoTracks && videoTracks[videoTrack.index]) {
      let currentTime = this._videoElement.currentTime;
      let paused = this._videoElement.paused;
      this._sourceObj = videoTracks[videoTrack.index];
      this._eventManager.listenOnce(this._videoElement, Html5Events.LOADED_DATA, () => {
        if (Env.browser.name === 'Android Browser') {
          // In android browser we have to seek only after some playback.
          this._eventManager.listenOnce(this._videoElement, Html5Events.DURATION_CHANGE, () => {
            this._videoElement.currentTime = currentTime;
          });
          this._eventManager.listenOnce(this._videoElement, Html5Events.SEEKED, () => {
            this._onTrackChanged(videoTrack);
            if (paused) {
              this._videoElement.pause();
            }
          });
          this._videoElement.play();
        } else {
          this._eventManager.listenOnce(this._videoElement, Html5Events.SEEKED, () => {
            this._onTrackChanged(videoTrack);
          });
          this._videoElement.currentTime = currentTime;
          if (!paused) {
            this._videoElement.play();
          }
        }
      });
      this._videoElement.src = this._sourceObj ? this._sourceObj.url : "";
    }
  }

  /**
   * Select a native video track
   * @function selectAdaptiveVideoTrack
   * @param {VideoTrack} videoTrack - the track to select
   * @returns {void}
   * @public
   */
  selectAdaptiveVideoTrack(videoTrack: VideoTrack): void {
    let videoTracks = this._videoElement.videoTracks;
    if ((videoTrack instanceof VideoTrack) && videoTracks && videoTracks[videoTrack.index]) {
      this._disableVideoTracks();
      videoTracks[videoTrack.index].selected = true;
      this._onTrackChanged(videoTrack);
    }
  }

  /**
   * Select an audio track
   * @function selectAudioTrack
   * @param {AudioTrack} audioTrack - the  audio track to select
   * @returns {void}
   * @public
   */
  selectAudioTrack(audioTrack: AudioTrack): void {
    let audioTracks = this._videoElement.audioTracks;
    if ((audioTrack instanceof AudioTrack) && audioTracks && audioTracks[audioTrack.index]) {
      this._disableAudioTracks();
      audioTracks[audioTrack.index].enabled = true;
      this._onTrackChanged(audioTrack);
    }
  }

  /**
   * Select a text track
   * @function selectTextTrack
   * @param {PKTextTrack} textTrack - The playkit text track
   * @returns {void}
   * @public
   */
  selectTextTrack(textTrack: PKTextTrack): void {
    let textTracks = this._videoElement.textTracks;
    if ((textTrack instanceof PKTextTrack) && (textTrack.kind === 'subtitles' || textTrack.kind === 'captions') && textTracks && textTracks[textTrack.index]) {
      this._disableTextTracks();
      textTracks[textTrack.index].mode = 'hidden';
      NativeAdapter._logger.debug('Text track changed', textTrack);
      this._onTrackChanged(textTrack);
    }
  }

  /**
   * Hide the text track
   * @function hideTextTrack
   * @returns {void}
   * @public
   */
  hideTextTrack(): void {
    this._disableTextTracks();
  }

  /**
   * Enables adaptive bitrate
   * @function enableAdaptiveBitrate
   * @returns {void}
   * @public
   */
  enableAdaptiveBitrate(): void {
    NativeAdapter._logger.warn('Enabling adaptive bitrate is not supported for native playback');
  }

  /**
   * Checking if adaptive bitrate switching is enabled.
   * For progressive playback will always returns false.
   * For adaptive playback will always returns true.
   * @function isAdaptiveBitrateEnabled
   * @returns {boolean} - Whether adaptive bitrate is enabled.
   * @public
   */
  isAdaptiveBitrateEnabled(): boolean {
    return !this._isProgressivePlayback();
  }

  /**
   * Disables all the existing video tracks.
   * @private
   * @returns {void}
   */
  _disableVideoTracks(): void {
    let videoTracks = this._videoElement.videoTracks;
    if (videoTracks) {
      for (let i = 0; i < videoTracks.length; i++) {
        videoTracks[i].selected = false;
      }
    }
  }

  /**
   * Disables all the existing audio tracks.
   * @private
   * @returns {void}
   */
  _disableAudioTracks(): void {
    let audioTracks = this._videoElement.audioTracks;
    if (audioTracks) {
      for (let i = 0; i < audioTracks.length; i++) {
        audioTracks[i].enabled = false;
      }
    }
  }

  /**
   * Disables all the existing text tracks.
   * @private
   * @returns {void}
   */
  _disableTextTracks(): void {
    let textTracks = this._videoElement.textTracks;
    if (textTracks) {
      for (let i = 0; i < textTracks.length; i++) {
        textTracks[i].mode = 'disabled';
      }
    }
  }

  /**
   * Returns the live edge
   * @returns {number} - live edge
   * @private
   */
  _getLiveEdge(): number {
    if (this._videoElement.seekable.length) {
      return this._videoElement.seekable.end(this._videoElement.seekable.length - 1);
    } else if (this._videoElement.buffered.length) {
      return this._videoElement.buffered.end(this._videoElement.buffered.length - 1);
    } else {
      return this._videoElement.duration;
    }
  }

  /**
   * Seeking to live edge.
   * @function seekToLiveEdge
   * @returns {void}
   * @public
   */
  seekToLiveEdge(): void {
    try {
      this._videoElement.currentTime = this._getLiveEdge();
    } catch
      (e) {
      return;
    }
  }

  /**
   * Checking if the current playback is live.
   * @function isLive
   * @returns {boolean} - Whether playback is live.
   * @public
   */
  isLive(): boolean {
    return this._videoElement.duration === Infinity;
  }

  /**
   * Getter for the src that the adapter plays on the video element.
   * @public
   * @returns {string} - The src url.
   */
  get src(): string {
    return this._videoElement.src;
  }

  /**
   * Get the duration in seconds.
   * @returns {Number} - The playback duration.
   * @public
   */
  get duration(): number {
    if (this.isLive()) {
      return this._getLiveEdge();
    } else {
      return super.duration;
    }
  }

}

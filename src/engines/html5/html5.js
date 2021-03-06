//@flow
import FakeEventTarget from '../../event/fake-event-target'
import FakeEvent from '../../event/fake-event'
import EventManager from '../../event/event-manager'
import {HTML5_EVENTS as Html5Events, CUSTOM_EVENTS as CustomEvents} from '../../event/events'
import MediaSourceProvider from './media-source/media-source-provider'
import VideoTrack from '../../track/video-track'
import AudioTrack from '../../track/audio-track'
import {TextTrack as PKTextTrack} from '../../track/text-track'
import {Cue} from '../../track/vtt-cue'
import * as Utils from '../../utils/util'

/**
 * Html5 engine for playback.
 * @classdesc
 */
export default class Html5 extends FakeEventTarget implements IEngine {
  /**
   * The video element.
   * @type {HTMLVideoElement}
   * @private
   */
  _el: HTMLVideoElement;
  /**
   * The event manager of the engine.
   * @type {EventManager}
   * @private
   */
  _eventManager: EventManager;
  /**
   * The selected media source adapter of the engine.
   * @type {IMediaSourceAdapter}
   * @private
   */
  _mediaSourceAdapter: ?IMediaSourceAdapter;

  /**
   * Flag to indicate first time text track cue change.
   * @type {Object.<number, boolean>}
   * @private
   */
  _showTextTrackFirstTime: { [number]: boolean } = {};

  /**
   * player config object.
   * @type {Object}
   * @private
   */
  _config: Object;

  /**
   * @type {string} - The engine id.
   */
  static id: string = "html5";

  /**
   * Factory method to create an engine.
   * @param {Source} source - The selected source object.
   * @param {Object} config - The player configuration.
   * @returns {IEngine} - New instance of the run time engine.
   * @public
   * @static
   */
  static createEngine(source: Source, config: Object): IEngine {
    return new this(source, config);
  }

  /**
   * Checks if the engine can play a given source.
   * @param {Source} source - The source object to check.
   * @param {boolean} preferNative - prefer native flag
   * @returns {boolean} - Whether the engine can play the source.
   * @public
   * @static
   */
  static canPlaySource(source: Source, preferNative: boolean): boolean {
    return MediaSourceProvider.canPlaySource(source, preferNative);
  }

  /**
   * @constructor
   * @param {Source} source - The selected source object.
   * @param {Object} config - The player configuration.
   */
  constructor(source: Source, config: Object) {
    super();
    this._config = config;
    this._eventManager = new EventManager();
    this._createVideoElement();
    this._loadMediaSourceAdapter(source);
    this.attach();
  }

  /**
   * Destroys the engine.
   * @public
   * @returns {void}
   */
  destroy(): void {
    this.detach();
    if (this._mediaSourceAdapter) {
      this._mediaSourceAdapter.destroy();
      MediaSourceProvider.destroy();
    }
    if (this._el) {
      this.pause();
      this._el.removeAttribute('src');
      if (this._el.parentNode) {
        this._el.parentNode.removeChild(this._el);
      }
    }
    this._showTextTrackFirstTime = {};
    this._eventManager.destroy();
  }

  /**
   * Get the engine's id
   * @public
   * @returns {string} the engine's id
   */
  get id(): string {
    return Html5.id;
  }

  /**
   * Listen to the video element events and triggers them from the engine.
   * @public
   * @returns {void}
   */
  attach(): void {
    for (let playerEvent in Html5Events) {
      this._eventManager.listen(this._el, Html5Events[playerEvent], () => {
        this.dispatchEvent(new FakeEvent(Html5Events[playerEvent]));
      });
    }
    if (this._mediaSourceAdapter) {
      this._eventManager.listen(this._mediaSourceAdapter, CustomEvents.VIDEO_TRACK_CHANGED, (event: FakeEvent) => this.dispatchEvent(event));
      this._eventManager.listen(this._mediaSourceAdapter, CustomEvents.AUDIO_TRACK_CHANGED, (event: FakeEvent) => this.dispatchEvent(event));
      this._eventManager.listen(this._mediaSourceAdapter, CustomEvents.TEXT_TRACK_CHANGED, (event: FakeEvent) => this.dispatchEvent(event));
      this._eventManager.listen(this._mediaSourceAdapter, CustomEvents.ABR_MODE_CHANGED, (event: FakeEvent) => this.dispatchEvent(event));
      this._eventManager.listen(this._mediaSourceAdapter, CustomEvents.TEXT_CUE_CHANGED, (event: FakeEvent) => this.dispatchEvent(event));
    }
  }

  /**
   * Remove the listeners of the video element events.
   * @public
   * @returns {void}
   */
  detach(): void {
    for (let playerEvent in Html5Events) {
      this._eventManager.unlisten(this._el, Html5Events[playerEvent]);
    }
    if (this._mediaSourceAdapter) { // unlisten to adaptive bitrate changed
      this._eventManager.unlisten(this._mediaSourceAdapter, CustomEvents.VIDEO_TRACK_CHANGED);
      this._eventManager.unlisten(this._mediaSourceAdapter, CustomEvents.AUDIO_TRACK_CHANGED);
      this._eventManager.unlisten(this._mediaSourceAdapter, CustomEvents.TEXT_TRACK_CHANGED);
      this._eventManager.unlisten(this._mediaSourceAdapter, CustomEvents.TEXT_CUE_CHANGED);
    }
  }

  /**
   * @returns {HTMLVideoElement} - The video element.
   * @public
   */
  getVideoElement(): HTMLVideoElement {
    return this._el;
  }

  /**
   * Creates a video element dom object.
   * @private
   * @returns {void}
   */
  _createVideoElement(): void {
    this._el = Utils.Dom.createElement("video");
    this._el.id = Utils.Generator.uniqueId(5);
    this._el.controls = false;
  }

  /**
   * Loads the appropriate media source extension adapter.
   * @param {Source} source - The selected source object.
   * @private
   * @returns {void}
   */
  _loadMediaSourceAdapter(source: Source): void {
    this._mediaSourceAdapter = MediaSourceProvider.getMediaSourceAdapter(this.getVideoElement(), source, this._config);
  }

  /**
   * Select a new video track.
   * @param {VideoTrack} videoTrack - The video track object to set.
   * @returns {void}
   */
  selectVideoTrack(videoTrack: VideoTrack): void {
    if (this._mediaSourceAdapter) {
      this._mediaSourceAdapter.selectVideoTrack(videoTrack);
    }
  }

  /**
   * Select a new audio track.
   * @param {AudioTrack} audioTrack - The video track object to set.
   * @returns {void}
   */
  selectAudioTrack(audioTrack: AudioTrack): void {
    if (this._mediaSourceAdapter) {
      this._mediaSourceAdapter.selectAudioTrack(audioTrack);
    }
  }

  /**
   * Select a new text track.
   * @param {PKTextTrack} textTrack - The playkit text track object to set.
   * @returns {void}
   */
  selectTextTrack(textTrack: PKTextTrack): void {
    this._removeCueChangeListener();
    if (this._mediaSourceAdapter) {
      this._mediaSourceAdapter.selectTextTrack(textTrack);
    }
    this._addCueChangeListener(textTrack);
  }

  /**
   * Add cuechange listener to active textTrack.
   * @param {PKTextTrack} textTrack - The playkit text track object to set.
   * @returns {void}
   * @private
   */
  _addCueChangeListener(textTrack: PKTextTrack): void {
    let textTrackEl = this._getSelectedTextTrackElement();
    if (textTrackEl) {
      /*
       There's a quirk in TextTrackAPI that a text track added to video element will not fire cuechange event if it
       didn't have it's mode set to showing for at least until a single cue has been change.
       After first time it seems there's time tracking which allows the cuechange to fire even though the track mode
       is set to hidden
       This is not the case with a track DOM element added to a video element where cuechange will be fired even if
       track mode is set only to hidden and was never set to showing
       */
      if (this._config.playback.useNativeTextTrack) {
        textTrackEl.mode = "showing";
      } else {
        textTrackEl.mode = this._showTextTrackFirstTime[textTrack.index] ? "hidden" : "showing";
        this._showTextTrackFirstTime[textTrack.index] = true;
        textTrackEl.oncuechange = (e) => this._onCueChange(e);
      }
    }
  }

  /**
   * Remove cuechange listener to active textTrack
   * @returns {void}
   * @private
   */
  _removeCueChangeListener(): void {
    let textTrackEl: TextTrack = this._getSelectedTextTrackElement();
    if (textTrackEl) {
      textTrackEl.oncuechange = null;
    }
  }

  /**
   * oncuechange event handler.
   * @param {FakeEvent} e - The event arg.
   * @returns {void}
   * @private
   */
  _onCueChange(e: FakeEvent): void {
    let textTrack: TextTrack = e.currentTarget;
    let activeCues: Array<Cue> = [];
    textTrack.mode = 'hidden';
    for (let cue of textTrack.activeCues) {
      //Normalize cues to be of type of VTT model
      if (cue instanceof window.VTTCue) {
        activeCues.push(cue);
      } else if (cue instanceof window.TextTrackCue) {
        activeCues.push(new Cue(cue.startTime, cue.endTime, cue.text));
      }
    }
    this.dispatchEvent(new FakeEvent(CustomEvents.TEXT_CUE_CHANGED, {cues: activeCues}));
  }

  /**
   * Get currently selected text track
   * @returns {?TextTrack} - returns the active text track element if available
   * @private
   */
  _getSelectedTextTrackElement(): ?TextTrack {
    const textTracks = this._el.textTracks;
    for (let track in textTracks) {
      if (textTracks.hasOwnProperty(track)) {
        const textTrack = textTracks[parseInt(track)];
        if (textTrack && textTrack.mode !== "disabled") {
          return textTrack;
        }
      }
    }
    return null;
  }

  /**
   * Hide the text track
   * @function hideTextTrack
   * @returns {void}
   * @public
   */
  hideTextTrack(): void {
    if (this._mediaSourceAdapter) {
      this._mediaSourceAdapter.hideTextTrack();
    }
    this._removeCueChangeListener();
  }

  /**
   * Enables adaptive bitrate switching according to the media source extension logic.
   * @function enableAdaptiveBitrate
   * @returns {void}
   * @public
   */
  enableAdaptiveBitrate(): void {
    if (this._mediaSourceAdapter) {
      this._mediaSourceAdapter.enableAdaptiveBitrate();
    }
  }

  /**
   * Checking if adaptive bitrate switching is enabled.
   * @function isAdaptiveBitrateEnabled
   * @returns {boolean} - Whether adaptive bitrate is enabled.
   * @public
   */
  isAdaptiveBitrateEnabled(): boolean {
    if (this._mediaSourceAdapter) {
      return this._mediaSourceAdapter.isAdaptiveBitrateEnabled();
    }
    return false;
  }

  /**
   * Seeking to live edge.
   * @function seekToLiveEdge
   * @returns {void}
   * @public
   */
  seekToLiveEdge(): void {
    if (this._mediaSourceAdapter) {
      this._mediaSourceAdapter.seekToLiveEdge();
    }
  }

  /**
   * Checking if the current playback is live.
   * @function isLive
   * @returns {boolean} - Whether playback is live.
   * @public
   */
  isLive(): boolean {
    return this._mediaSourceAdapter ? this._mediaSourceAdapter.isLive() : false;
  }

  /**
   * Set a source.
   * @param {string} source - Source to set.
   * @public
   * @returns {void}
   */
  set src(source: string): void {
    this._el.src = source;
  }

  /**
   * Get the source url.
   * @returns {string} - The source url.
   * @public
   */
  get src(): string {
    if (this._mediaSourceAdapter) {
      return this._mediaSourceAdapter.src;
    }
    return "";
  }

  //playback interface
  /**
   * Start/resume playback.
   * @public
   * @returns {void}
   */
  play(): void {
    this._el.play();
  }

  /**
   * Pause playback.
   * @public
   * @returns {void}
   */
  pause(): void {
    return this._el.pause();
  }

  /**
   * Load media.
   * @param {number} startTime - Optional time to start the video from.
   * @public
   * @returns {Promise<Object>} - The loaded data
   */
  load(startTime: ?number): Promise<Object> {
    this._el.load();
    if (this._mediaSourceAdapter) {
      return this._mediaSourceAdapter.load(startTime);
    }
    return Promise.resolve({});
  }

  /**
   * Get the current time in seconds.
   * @returns {Number} - The current playback time.
   * @public
   */
  get currentTime(): number {
    return this._mediaSourceAdapter ? this._mediaSourceAdapter.currentTime : 0;
  }

  /**
   * Set the current time in seconds.
   * @param {Number} to - The number to set in seconds.
   * @public
   * @returns {void}
   */
  set currentTime(to: number): void {
    if (this._mediaSourceAdapter) {
      this._mediaSourceAdapter.currentTime = to;
    }
  }

  /**
   * Get the duration in seconds.
   * @returns {Number} - The playback duration.
   * @public
   */
  get duration(): number {
    return this._mediaSourceAdapter ? this._mediaSourceAdapter.duration : NaN;
  }

  /**
   * Set playback volume.
   * @param {Number} vol - The volume to set.
   * @public
   * @returns {void}
   */
  set volume(vol: number): void {
    this._el.volume = vol;
  }

  /**
   * Get playback volume.
   * @returns {Number} - The volume value of the video element.
   * @public
   */
  get volume(): number {
    return this._el.volume;
  }

  ready() {
  }

  /**
   * Get paused state.
   * @returns {boolean} - The paused value of the video element.
   * @public
   */
  get paused(): boolean {
    return this._el.paused;
  }

  /**
   * Get seeking state.
   * @returns {boolean} - The seeking value of the video element.
   * @public
   */
  get seeking(): boolean {
    return this._el.seeking;
  }

  /**
   * Get the first seekable range (part) of the video in seconds.
   * @returns {TimeRanges} - First seekable range (part) of the video in seconds.
   * @public
   */
  get seekable(): TimeRanges {
    return this._el.seekable;
  }

  /**
   * Get the first played range (part) of the video in seconds.
   * @returns {TimeRanges} - First played range (part) of the video in seconds.
   * @public
   */
  get played(): TimeRanges {
    return this._el.played;
  }

  /**
   * Get the first buffered range (part) of the video in seconds.
   * @returns {TimeRanges} - First buffered range (part) of the video in seconds.
   * @public
   */
  get buffered(): TimeRanges {
    return this._el.buffered;
  }

  /**
   * Set player muted state.
   * @param {boolean} mute - The new mute value.
   * @public
   * @returns {void}
   */
  set muted(mute: boolean): void {
    this._el.muted = mute;
  }

  /**
   * Get player muted state.
   * @returns {boolean} - The muted value of the video element.
   * @public
   */
  get muted(): boolean {
    return this._el.muted;
  }

  /**
   * Get the default mute value.
   * @returns {boolean} - The defaultMuted of the video element.
   * @public
   */
  get defaultMuted(): boolean {
    return this._el.defaultMuted;
  }

  /**
   * Sets an image to be shown while the video is downloading, or until the user hits the play button.
   * @param {string} poster - The image url to be shown.
   * @returns {void}
   * @public
   */
  set poster(poster: string): void {
    this._el.poster = poster;
  }

  /**
   * Gets an image to be shown while the video is downloading, or until the user hits the play button.
   * @returns {poster} - The image url.
   * @public
   */
  get poster(): string {
    return this._el.poster;
  }

  /**
   * Specifies if and how the author thinks that the video should be loaded when the page loads.
   * @param {string} preload - The preload value.
   * @public
   * @returns {void}
   */
  set preload(preload: string): void {
    this._el.preload = preload;
  }

  /**
   * Gets the preload value of the video element.
   * @returns {string} - The preload value.
   * @public
   */
  get preload(): string {
    return this._el.preload;
  }

  /**
   * Set if the video will automatically start playing as soon as it can do so without stopping.
   * @param {boolean} autoplay - The autoplay value.
   * @public
   * @returns {void}
   */
  set autoplay(autoplay: boolean): void {
    this._el.autoplay = autoplay;
  }

  /**
   * Gets the autoplay value of the video element.
   * @returns {boolean} - The autoplay value.
   * @public
   */
  get autoplay(): boolean {
    return this._el.autoplay;
  }

  /**
   * Set to specifies that the video will start over again, every time it is finished.
   * @param {boolean} loop - the loop value.
   * @public
   * @returns {void}
   */
  set loop(loop: boolean) {
    this._el.loop = loop;
  }

  /**
   * Gets the loop value of the video element.
   * @returns {boolean} - The loop value.
   * @public
   */
  get loop(): boolean {
    return this._el.loop;
  }

  /**
   * Set to specifies that video controls should be displayed.
   * @param {boolean} controls - the controls value.
   * @public
   * @returns {void}
   */
  set controls(controls: boolean): void {
    this._el.controls = controls;
  }

  /**
   * Gets the controls value of the video element.
   * @returns {boolean} - The controls value.
   * @public
   */
  get controls(): boolean {
    return this._el.controls;
  }

  /**
   * Sets the current playback speed of the audio/video.
   * @param {Number} playbackRate - The playback speed value.
   * @public
   * @returns {void}
   */
  set playbackRate(playbackRate: number): void {
    this._el.playbackRate = playbackRate;
  }

  /**
   * Gets the current playback speed of the audio/video.
   * @returns {Number} - The current playback speed value.
   * @public
   */
  get playbackRate(): number {
    return this._el.playbackRate;
  }

  /**
   * Sets the default playback speed of the audio/video.
   * @param {Number} defaultPlaybackRate - The default playback speed value.
   * @public
   * @returns {void}
   */
  set defaultPlaybackRate(defaultPlaybackRate: number) {
    this._el.defaultPlaybackRate = defaultPlaybackRate;
  }

  /**
   * Gets the default playback speed of the audio/video.
   * @returns {Number} - The default playback speed value.
   * @public
   */
  get defaultPlaybackRate(): number {
    return this._el.defaultPlaybackRate;
  }

  /**
   * The ended property returns whether the playback of the audio/video has ended.
   * @returns {boolean} - The ended value.
   * @public
   */
  get ended(): boolean {
    return this._el.ended;
  }

  /**
   * The error property returns a MediaError object.
   * @returns {MediaError} - The MediaError object has a code property containing the error state of the audio/video.
   * @public
   */
  get error(): ?MediaError {
    return this._el.error;
  }

  /**
   * @returns {Number} - The current network state (activity) of the audio/video.
   * @public
   */
  get networkState(): number {
    return this._el.networkState;
  }

  /**
   * Indicates if the audio/video is ready to play or not.
   * @returns {Number} - The current ready state of the audio/video.
   * 0 = HAVE_NOTHING - no information whether or not the audio/video is ready.
   * 1 = HAVE_METADATA - metadata for the audio/video is ready.
   * 2 = HAVE_CURRENT_DATA - data for the current playback position is available, but not enough data to play next frame/millisecond.
   * 3 = HAVE_FUTURE_DATA - data for the current and at least the next frame is available.
   * 4 = HAVE_ENOUGH_DATA - enough data available to start playing.
   */
  get readyState(): number {
    return this._el.readyState;
  }

  /**
   * @returns {Number} - The height of the video player, in pixels.
   * @public
   */
  get videoHeight(): number {
    return this._el.videoHeight;
  }

  /**
   * @returns {Number} - The width of the video player, in pixels.
   * @public
   */
  get videoWidth(): number {
    return this._el.videoWidth;
  }

  /**
   * @param {boolean} playsinline - Whether to set on the video tag the playsinline attribute.
   */
  set playsinline(playsinline: boolean): void {
    if (playsinline) {
      this._el.setAttribute('playsinline', '');
    } else {
      this._el.removeAttribute('playsinline');
    }
  }

  /**
   * @returns {boolean} - Whether the video tag has an attribute of playsinline.
   */
  get playsinline(): boolean {
    return this._el.getAttribute('playsinline') === '';
  }

  /**
   * Test video element to check if html5 engine is supported.
   */
  static TEST_VID: HTMLVideoElement;

  /**
   * Checks if the html5 engine is supported.
   * @returns {boolean} - The isSupported result.
   * @static
   * @public
   */
  static isSupported() {
    try {
      Html5.TEST_VID = Utils.Dom.createElement('video');
      Html5.TEST_VID.volume = 0.5;
    } catch (e) {
      return false;
    }
    return !!Html5.TEST_VID.canPlayType;
  }
}

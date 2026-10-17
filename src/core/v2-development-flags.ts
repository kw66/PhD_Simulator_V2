/**
 * Temporary development switch for inspecting unfinished panels before
 * enrollment. Set to false before release to restore the enrollment gate.
 */
export const SHOW_ALL_MODULES_DURING_DEVELOPMENT = false;

declare const __LOCAL_PLAYGROUND__: boolean;

/** Build-time gate plus loopback-only access; no query string or storage override. */
export const ENABLE_LOCAL_PLAYGROUND = import.meta.env.DEV
  && typeof __LOCAL_PLAYGROUND__ !== "undefined" && __LOCAL_PLAYGROUND__
  && typeof location !== "undefined"
  && /^(?:localhost|.+\.localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)\.?$/i.test(location.hostname);

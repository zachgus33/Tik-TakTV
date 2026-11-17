import type { Setup } from "./account";

export function persistableSetup(setup: Setup): Setup {
  const { trakt: _trakt, watched: _watched, ...profileSetup } = setup;
  return {
    ...profileSetup,
    // Account bearer tokens are derived from the live Nuvio session. They
    // must never be copied into profile blobs or survive sign-out.
    playbackService: setup.playbackService?.account
      ? null
      : setup.playbackService,
  };
}

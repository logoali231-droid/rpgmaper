/**
 * Static host for the RPG Map Editor build.
 * The app is a single-page client-side editor, so every request (pages and
 * assets) is served from the uploaded asset bundle.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};

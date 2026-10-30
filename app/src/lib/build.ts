/** "0.1.3 · a1c3ae6" for a CI build, "0.1.3 · local build" for one made on a laptop. */
export const describeBuild = (version: string, commit: string): string =>
  commit ? `${version} · ${commit}` : `${version} · local build`;

export const BUILD_LABEL = describeBuild(__APP_VERSION__, __BUILD_COMMIT__);

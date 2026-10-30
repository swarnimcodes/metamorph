/// <reference types="vite/client" />
/// <reference types="google.accounts" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_LOGIN?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

/** Injected by Vite (see vite.config.ts). */
declare const __APP_VERSION__: string;
declare const __BUILD_COMMIT__: string;

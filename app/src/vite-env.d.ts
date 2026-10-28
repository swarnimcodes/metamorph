/// <reference types="vite/client" />
/// <reference types="google.accounts" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_LOGIN?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

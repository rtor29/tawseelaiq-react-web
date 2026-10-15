/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_REALTIME_MODE: 'signalr' | 'socketio';
  readonly VITE_REALTIME_HUB_URL: string;
  readonly VITE_MAPBOX_TOKEN: string;
  readonly VITE_MAP_STYLE: string;
  readonly VITE_NAVIGATION_STYLE: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_DEV_BACKEND_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

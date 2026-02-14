import type { GateKeeperApi } from '../../preload/preload';

declare global {
  interface Window {
    gatekeeper: GateKeeperApi;
  }
}

export {};

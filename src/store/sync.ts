import { create } from "zustand";
import { getClientConfig } from "../config/client";
import {
  AppState,
  getLocalAppState,
  mergeAppState,
  setLocalAppState,
} from "../utils/sync";
import { downloadAs, readFromFile } from "../utils";
import { showToast } from "../components/ui-lib";
import Locale from "../locales";

const isApp = !!getClientConfig()?.isApp;

export interface SyncStoreState {
  export: () => void;
  import: () => Promise<void>;
}

export const useSyncStore = create<SyncStoreState>(() => ({
  export() {
    const state = getLocalAppState();
    const datePart = isApp
      ? `${new Date().toLocaleDateString().replace(/\//g, "_")} ${new Date()
          .toLocaleTimeString()
          .replace(/:/g, "_")}`
      : new Date().toLocaleString();

    const fileName = `Backup-${datePart}.json`;
    downloadAs(JSON.stringify(state), fileName);
  },

  async import() {
    const rawContent = await readFromFile();

    try {
      const remoteState = JSON.parse(rawContent) as AppState;
      const localState = getLocalAppState();
      mergeAppState(localState, remoteState);
      setLocalAppState(localState);
      location.reload();
    } catch (e) {
      console.error("[Import]", e);
      showToast(Locale.Settings.Sync.ImportFailed);
    }
  },
}));

export type SyncStore = ReturnType<typeof useSyncStore.getState>;

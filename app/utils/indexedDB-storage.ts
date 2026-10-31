import { StateStorage } from "zustand/middleware";
import { get, set, del, clear } from "idb-keyval";

function safeLocalStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
} {
  let storage: Storage | null = null;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      storage = window.localStorage;
    }
  } catch (e) {
    storage = null;
  }

  return {
    getItem(key: string): string | null {
      try {
        return storage ? storage.getItem(key) : null;
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        if (storage) storage.setItem(key, value);
      } catch {}
    },
    removeItem(key: string): void {
      try {
        if (storage) storage.removeItem(key);
      } catch {}
    },
    clear(): void {
      try {
        if (storage) storage.clear();
      } catch {}
    },
  };
}

const localStorage = safeLocalStorage();

class IndexedDBStorage implements StateStorage {
  public async getItem(name: string): Promise<string | null> {
    try {
      const value = (await get(name)) || localStorage.getItem(name);
      return value;
    } catch (error) {
      return localStorage.getItem(name);
    }
  }

  public async setItem(name: string, value: string): Promise<void> {
    try {
      const _value = JSON.parse(value);
      if (!_value?.state?._hasHydrated) {
        console.warn("skip setItem", name);
        return;
      }
      await set(name, value);
    } catch (error) {
      localStorage.setItem(name, value);
    }
  }

  public async removeItem(name: string): Promise<void> {
    try {
      await del(name);
    } catch (error) {
      localStorage.removeItem(name);
    }
  }

  public async clear(): Promise<void> {
    try {
      await clear();
    } catch (error) {
      localStorage.clear();
    }
  }
}

export const indexedDBStorage = new IndexedDBStorage();

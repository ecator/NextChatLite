import { nanoid } from "nanoid";
import { BUILTIN_MASKS, BUILTIN_MASK_STORE, fetchBuiltinMasks } from "../masks";
import { getLang, Lang } from "../locales";
import Locale from "../locales";
import type { ChatMessage } from "./chat";
export const DEFAULT_TOPIC = Locale.Store.DefaultTopic;
import { ModelConfig, useAppConfig } from "./config";
import { StoreKey } from "../constant";
import { createPersistStore } from "../utils/store";
import { validateModelOrFallback } from "./models";

export type Mask = {
  id: string;
  createdAt: number;
  avatar: string;
  name: string;
  hideContext?: boolean;
  context: ChatMessage[];
  syncGlobalConfig?: boolean;
  modelConfig: ModelConfig;
  lang: Lang;
  builtin: boolean;
  plugin?: string[];
  enableArtifacts?: boolean;
  enableCodeFold?: boolean;
};

export const DEFAULT_MASK_STATE = {
  masks: {} as Record<string, Mask>,
  language: undefined as Lang | undefined,
  builtinMasks: {} as Record<string, Mask>,
};

export type MaskState = typeof DEFAULT_MASK_STATE;

export const DEFAULT_MASK_AVATAR = "gpt-bot";
export function createEmptyMask(): Mask {
  const globalModelConfig = { ...useAppConfig.getState().modelConfig };
  const validated = validateModelOrFallback(
    globalModelConfig.model,
    globalModelConfig.providerName,
  );
  globalModelConfig.model = validated.model as any;
  globalModelConfig.providerName = validated.providerName as any;

  return {
    id: nanoid(),
    avatar: DEFAULT_MASK_AVATAR,
    name: DEFAULT_TOPIC,
    context: [],
    syncGlobalConfig: true, // use global config as default
    modelConfig: globalModelConfig,
    lang: getLang(),
    builtin: false,
    createdAt: Date.now(),
    plugin: [],
  };
}

export const useMaskStore = createPersistStore(
  { ...DEFAULT_MASK_STATE },

  (set, get) => ({
    create(mask?: Partial<Mask>) {
      const masks = { ...get().masks };
      const id = nanoid();
      const newMask: Mask = {
        ...createEmptyMask(),
        ...mask,
        id,
        builtin: false,
      };

      const validated = validateModelOrFallback(
        newMask.modelConfig.model,
        newMask.modelConfig.providerName,
      );
      newMask.modelConfig.model = validated.model as any;
      newMask.modelConfig.providerName = validated.providerName as any;

      masks[id] = newMask;

      set(() => ({ masks }));
      get().markUpdate();

      return masks[id];
    },
    updateMask(id: string, updater: (mask: Mask) => void) {
      // Server-fetched masks are read-only and cannot be modified
      if (get().builtinMasks[id] || BUILTIN_MASK_STORE.get(id)) return;
      const masks = { ...get().masks };
      const mask = masks[id];
      if (!mask || mask.builtin) return;

      const updateMask = { ...mask };
      updater(updateMask);
      const validated = validateModelOrFallback(
        updateMask.modelConfig.model,
        updateMask.modelConfig.providerName,
      );
      updateMask.modelConfig.model = validated.model as any;
      updateMask.modelConfig.providerName = validated.providerName as any;

      masks[id] = updateMask;
      set(() => ({ masks }));
      get().markUpdate();
    },
    delete(id: string) {
      // Server-fetched masks cannot be deleted
      if (get().builtinMasks[id] || BUILTIN_MASK_STORE.get(id)) return;
      const masks = { ...get().masks };
      if (!masks[id] || masks[id].builtin) return;

      delete masks[id];
      set(() => ({ masks }));
      get().markUpdate();
    },

    get(id?: string) {
      if (!id) return undefined;
      return (
        get().masks[id] ?? get().builtinMasks[id] ?? BUILTIN_MASK_STORE.get(id)
      );
    },
    getAll() {
      const userMasks = Object.values(get().masks)
        .filter((m) => !m.builtin)
        .sort((a, b) => b.createdAt - a.createdAt);
      const config = useAppConfig.getState();
      if (config.hideBuiltinMasks) return userMasks;

      const rawBuiltin =
        Object.keys(get().builtinMasks).length > 0
          ? Object.values(get().builtinMasks)
          : BUILTIN_MASKS;

      const serverMasks = rawBuiltin.map(
        (m) =>
          ({
            ...m,
            modelConfig: {
              ...config.modelConfig,
              ...m.modelConfig,
            },
          }) as Mask,
      );

      // Return both user and server masks merged together (even if they have the same name)
      return userMasks.concat(serverMasks);
    },
    search(text: string) {
      return (get() as any).getAll();
    },
    setLanguage(language: Lang | undefined) {
      set({
        language,
      });
    },
    async fetchServerMasks() {
      if (typeof window === "undefined") return;
      try {
        const builtinList = await fetchBuiltinMasks();
        const builtinMasks: Record<string, Mask> = {};
        const config = useAppConfig.getState();
        builtinList.forEach((m) => {
          const mergedConfig = {
            ...config.modelConfig,
            ...m.modelConfig,
          };
          const validated = validateModelOrFallback(
            mergedConfig.model,
            mergedConfig.providerName,
          );
          mergedConfig.model = validated.model as any;
          mergedConfig.providerName = validated.providerName as any;

          builtinMasks[String(m.id)] = {
            ...m,
            id: String(m.id),
            builtin: true,
            modelConfig: mergedConfig,
          } as Mask;
        });
        set(() => ({ builtinMasks }));
      } catch (e) {
        console.error("[Mask] fetchServerMasks failed", e);
      }
    },
  }),
  {
    name: StoreKey.Mask,
    version: 3.2,

    // Only persist local user masks and language, never server masks
    partialize: (state: any) => ({
      masks: Object.fromEntries(
        Object.entries(state.masks).filter(
          ([_, m]: [string, any]) => !m.builtin,
        ),
      ),
      language: state.language,
    }),

    onRehydrateStorage: () => (state: any) => {
      if (typeof window === "undefined" || !state) return;

      // Purge any legacy builtin masks from storage
      if (state.masks) {
        let changed = false;
        const cleanedMasks = { ...state.masks };
        Object.keys(cleanedMasks).forEach((key) => {
          if (cleanedMasks[key]?.builtin) {
            delete cleanedMasks[key];
            changed = true;
          }
        });
        if (changed) {
          useMaskStore.setState({ masks: cleanedMasks });
          state.markUpdate?.();
        }
      }

      state.fetchServerMasks?.();
    },

    migrate(state: any, version: number) {
      const newState = JSON.parse(JSON.stringify(state)) as MaskState;

      // Purge any legacy builtin masks
      if (newState.masks) {
        Object.keys(newState.masks).forEach((key) => {
          if (newState.masks[key]?.builtin) {
            delete newState.masks[key];
          }
        });
      }

      // migrate mask id to nanoid
      if (version < 3) {
        Object.values(newState.masks).forEach((m) => (m.id = nanoid()));
      }

      if (version < 3.1) {
        const updatedMasks: Record<string, Mask> = {};
        Object.values(newState.masks).forEach((m) => {
          updatedMasks[m.id] = m;
        });
        newState.masks = updatedMasks;
      }

      return newState as any;
    },
  },
);

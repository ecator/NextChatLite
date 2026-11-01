import Fuse from "fuse.js";
import { nanoid } from "nanoid";
import { StoreKey } from "../constant";
import { getLang } from "../locales";
import { createPersistStore } from "../utils/store";

export interface Prompt {
  id: string;
  isUser?: boolean;
  title: string;
  content: string;
  createdAt: number;
}

export const SearchService = {
  ready: false,
  builtinEngine: new Fuse<Prompt>([], { keys: ["title"] }),
  userEngine: new Fuse<Prompt>([], { keys: ["title"] }),
  count: {
    builtin: 0,
  },
  allPrompts: [] as Prompt[],
  builtinPrompts: [] as Prompt[],

  init(builtinPrompts: Prompt[], userPrompts: Prompt[]) {
    this.allPrompts = userPrompts.concat(builtinPrompts);
    this.builtinPrompts = builtinPrompts.slice();
    this.builtinEngine.setCollection(builtinPrompts);
    this.userEngine.setCollection(userPrompts);
    this.ready = true;
  },

  remove(id: string) {
    this.userEngine.remove((doc) => doc.id === id);
  },

  add(prompt: Prompt) {
    this.userEngine.add(prompt);
  },

  search(text: string) {
    const userResults = this.userEngine.search(text);
    const builtinResults = this.builtinEngine.search(text);
    return userResults.concat(builtinResults).map((v) => v.item);
  },
};

export const DEFAULT_PROMPT_STATE = {
  counter: 0,
  prompts: {} as Record<string, Prompt>,
  builtinPrompts: [] as Prompt[],
};

export type PromptState = typeof DEFAULT_PROMPT_STATE;

export const usePromptStore = createPersistStore(
  { ...DEFAULT_PROMPT_STATE },

  (set, get) => ({
    add(prompt: Prompt) {
      const prompts = get().prompts;
      prompt.id = nanoid();
      prompt.isUser = true;
      prompt.createdAt = Date.now();
      prompts[prompt.id] = prompt;

      SearchService.add(prompt);

      set(() => ({
        prompts: prompts,
      }));
      get().markUpdate();

      return prompt.id!;
    },

    get(id: string) {
      const targetPrompt = get().prompts[id];

      if (!targetPrompt) {
        return (
          get().builtinPrompts.find((v) => v.id === id) ??
          SearchService.builtinPrompts.find((v) => v.id === id)
        );
      }

      return targetPrompt;
    },

    remove(id: string) {
      // Server-fetched prompts cannot be deleted
      if (get().builtinPrompts.some((v) => v.id === id)) return;
      const prompts = get().prompts;
      if (!prompts[id] || !prompts[id].isUser) return;

      delete prompts[id];

      Object.entries(prompts).some(([key, prompt]) => {
        if (prompt.id === id) {
          delete prompts[key];
          return true;
        }
        return false;
      });

      SearchService.remove(id);

      set(() => ({
        prompts,
        counter: get().counter + 1,
      }));
      get().markUpdate();
    },

    getUserPrompts() {
      const userPrompts = Object.values(get().prompts ?? {}).filter(
        (p) => p.isUser,
      );
      userPrompts.sort((a, b) =>
        b.id && a.id ? b.createdAt - a.createdAt : 0,
      );
      return userPrompts;
    },

    getAll() {
      // Return both user prompts and server prompts merged together (even if same title)
      return get().getUserPrompts().concat(get().builtinPrompts);
    },

    updatePrompt(id: string, updater: (prompt: Prompt) => void) {
      // Server-fetched prompts cannot be modified
      if (get().builtinPrompts.some((v) => v.id === id)) return;
      const prompts = get().prompts;
      const prompt = prompts[id];
      if (!prompt || !prompt.isUser) return;

      SearchService.remove(id);
      const updatedPrompt = { ...prompt };
      updater(updatedPrompt);
      prompts[id] = updatedPrompt;
      set(() => ({ prompts }));
      SearchService.add(updatedPrompt);
      get().markUpdate();
    },

    search(text: string) {
      if (text.length === 0) {
        return get().getAll();
      }
      return SearchService.search(text) as Prompt[];
    },

    async fetchServerPrompts() {
      if (typeof window === "undefined") {
        return;
      }

      const PROMPT_URL = "./prompts.json";
      type PromptList = Array<[string, string]>;

      try {
        const res = await fetch(PROMPT_URL)
          .catch(() => fetch("/prompts.json"))
          .then((r) => r.json());

        let fetchPrompts = [res.en, res.tw, res.cn];
        if (getLang() === "cn") {
          fetchPrompts = fetchPrompts.reverse();
        }

        const builtinPrompts: Prompt[] = [];
        fetchPrompts.forEach((promptList: PromptList) => {
          if (Array.isArray(promptList)) {
            promptList.forEach(([title, content], index) => {
              if (title && content) {
                builtinPrompts.push({
                  id: `builtin_${builtinPrompts.length}`,
                  title,
                  content,
                  createdAt: 0,
                  isUser: false,
                });
              }
            });
          }
        });

        const userPrompts = get().getUserPrompts() ?? [];
        SearchService.count.builtin = builtinPrompts.length;
        SearchService.init(builtinPrompts, userPrompts);
        set(() => ({ builtinPrompts }));
      } catch (e) {
        console.error("[Prompt] fetchServerPrompts failed", e);
      }
    },
  }),
  {
    name: StoreKey.Prompt,
    version: 3.1,

    // Only persist local user prompts and counter, never server prompts
    partialize: (state) => ({
      counter: state.counter,
      prompts: Object.fromEntries(
        Object.entries(state.prompts).filter(([_, p]) => p.isUser),
      ),
    }),

    onRehydrateStorage(state) {
      if (typeof window === "undefined") {
        return;
      }

      // Purge any legacy non-user prompts from storage
      if (state?.prompts) {
        let changed = false;
        Object.keys(state.prompts).forEach((key) => {
          if (!state.prompts[key]?.isUser) {
            delete state.prompts[key];
            changed = true;
          }
        });
        if (changed) {
          state.markUpdate();
        }
      }

      state?.fetchServerPrompts();
    },

    migrate(state, version) {
      const newState = JSON.parse(
        JSON.stringify(state),
      ) as typeof DEFAULT_PROMPT_STATE;

      // Purge any legacy non-user prompts
      if (newState.prompts) {
        Object.keys(newState.prompts).forEach((key) => {
          if (!newState.prompts[key]?.isUser) {
            delete newState.prompts[key];
          }
        });
      }

      if (version < 3) {
        Object.values(newState.prompts).forEach((p) => (p.id = nanoid()));
      }

      return newState as any;
    },
  },
);

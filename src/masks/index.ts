import { Mask } from "../store/mask";

import { type BuiltinMask } from "./typing";
export { type BuiltinMask } from "./typing";

export const BUILTIN_MASK_ID = 100000;

export const BUILTIN_MASK_STORE = {
  buildinId: BUILTIN_MASK_ID,
  masks: {} as Record<string, BuiltinMask>,
  get(id?: string) {
    if (!id) return undefined;
    return this.masks[id] as Mask | undefined;
  },
  add(m: BuiltinMask) {
    const id = String(m.id || this.buildinId++);
    const mask = { ...m, id, builtin: true };
    this.masks[mask.id] = mask;
    return mask;
  },
};

export const BUILTIN_MASKS: BuiltinMask[] = [];

let fetchPromise: Promise<BuiltinMask[]> | null = null;

export function fetchBuiltinMasks(): Promise<BuiltinMask[]> {
  if (typeof window === "undefined") {
    return Promise.resolve([]);
  }
  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = fetch("./masks.json")
    .catch(() => fetch("/masks.json"))
    .then((res) => res.json())
    .catch((error) => {
      console.error("[Fetch] failed to fetch masks", error);
      return { cn: [], tw: [], en: [] };
    })
    .then((masks) => {
      const { cn = [], tw = [], en = [] } = masks;
      const all = [...cn, ...tw, ...en];
      all.forEach((m) => {
        if (!BUILTIN_MASK_STORE.masks[String(m.id)]) {
          const added = BUILTIN_MASK_STORE.add(m);
          BUILTIN_MASKS.push(added);
        }
      });
      return BUILTIN_MASKS;
    });

  return fetchPromise;
}

if (typeof window !== "undefined") {
  fetchBuiltinMasks();
}

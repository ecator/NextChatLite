import { createPersistStore } from "../utils/store";
import { StoreKey } from "../constant";
import snapshot from "@opencode-ai/models/snapshot";
import { Models } from "@opencode-ai/models";

export interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  contextLimit: number;
  outputLimit: number;
  hasVision: boolean;
  hasReasoning: boolean;
  reasoningType?: "level" | "budget";
  hasTools: boolean;
  supportsTemperature?: boolean;
  cost?: { input: number; output: number; cache_read?: number };
  description?: string;
  family?: string;
}

export function parseModelMetadataSafely(
  raw: any,
  defaultKey?: string,
  defaultProvider?: string,
): ModelMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    const rawId =
      typeof raw === "string" && raw.trim()
        ? raw.trim()
        : defaultKey || "unknown-model";
    const [extractedKey, extractedProvider] = rawId.includes("/")
      ? [rawId.split("/")[1], rawId.split("/")[0]]
      : [rawId, defaultProvider || "custom"];
    return {
      id: rawId || "unknown-model",
      name: rawId || "unknown-model",
      provider: defaultProvider || extractedProvider || "custom",
      contextLimit: 4096,
      outputLimit: 4096,
      hasVision: false,
      hasReasoning: false,
      hasTools: true,
      supportsTemperature: true,
    };
  }

  // Determine ID
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : defaultKey?.trim() || "unknown-model";

  // Determine Provider
  const provider =
    typeof raw.provider === "string" && raw.provider.trim()
      ? raw.provider.trim()
      : defaultProvider ||
        (defaultKey && defaultKey.includes("/")
          ? defaultKey.split("/")[0]
          : id.includes("/")
            ? id.split("/")[0]
            : "custom");

  // Determine Name
  const name =
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id;

  // Context Limit
  const rawContext =
    raw.contextLimit !== undefined
      ? Number(raw.contextLimit)
      : Number(raw.limit?.context);
  const contextLimit =
    typeof rawContext === "number" && rawContext > 0 && !isNaN(rawContext)
      ? rawContext
      : 4096;

  // Output Limit
  const rawOutput =
    raw.outputLimit !== undefined
      ? Number(raw.outputLimit)
      : Number(raw.limit?.output);
  const outputLimit =
    typeof rawOutput === "number" && rawOutput > 0 && !isNaN(rawOutput)
      ? rawOutput
      : 4096;

  // Vision Capability
  let hasVision = false;
  if (typeof raw.hasVision === "boolean") {
    hasVision = raw.hasVision;
  } else if (raw.attachment === true) {
    hasVision = true;
  } else if (
    Array.isArray(raw.modalities?.input) &&
    raw.modalities.input.includes("image")
  ) {
    hasVision = true;
  }

  // Reasoning Capability
  let hasReasoning = false;
  if (typeof raw.hasReasoning === "boolean") {
    hasReasoning = raw.hasReasoning;
  } else if (raw.reasoning === true) {
    hasReasoning = true;
  } else if (
    Array.isArray(raw.reasoning_options) &&
    raw.reasoning_options.length > 0
  ) {
    hasReasoning = true;
  } else if (raw.thinkingConfig) {
    hasReasoning = true;
  }

  // Reasoning Type ("level" | "budget")
  let reasoningType: "level" | "budget" | undefined = raw.reasoningType;
  if (!reasoningType && hasReasoning) {
    const idLower = (id + " " + name).toLowerCase();
    if (
      idLower.includes("gemini-3") ||
      idLower.includes("gemini 3") ||
      idLower.includes("o3") ||
      idLower.includes("o1") ||
      idLower.includes("thinkinglevel") ||
      idLower.includes("thinking_level")
    ) {
      reasoningType = "level";
    } else if (
      idLower.includes("gemini-2.5") ||
      idLower.includes("gemini 2.5") ||
      idLower.includes("thinkingbudget") ||
      idLower.includes("thinking_budget")
    ) {
      reasoningType = "budget";
    } else if (Array.isArray(raw.reasoning_options)) {
      if (
        raw.reasoning_options.some(
          (o: any) =>
            typeof o === "string" &&
            (o.includes("budget") || o.includes("token")),
        )
      ) {
        reasoningType = "budget";
      } else {
        reasoningType = "level";
      }
    }
  }

  // Tool Calling Capability
  let hasTools = true;
  if (typeof raw.hasTools === "boolean") {
    hasTools = raw.hasTools;
  } else if (raw.tool_call !== undefined) {
    hasTools = Boolean(raw.tool_call);
  }

  // Temperature Support
  let supportsTemperature = true;
  if (typeof raw.supportsTemperature === "boolean") {
    supportsTemperature = raw.supportsTemperature;
  } else if (raw.temperature !== undefined) {
    supportsTemperature = raw.temperature !== false;
  }

  // Cost
  const cost = raw.cost;

  return {
    id,
    name,
    provider,
    contextLimit,
    outputLimit,
    hasVision,
    hasReasoning,
    reasoningType,
    hasTools,
    supportsTemperature,
    cost,
    description: raw.description,
    family: raw.family,
  };
}

export function parseModelsDevCatalog(
  rawPayload: any,
): Record<string, ModelMetadata> {
  const result: Record<string, ModelMetadata> = {};
  if (!rawPayload || typeof rawPayload !== "object") return result;

  // Case 1: has .models object
  if (
    rawPayload.models &&
    typeof rawPayload.models === "object" &&
    !Array.isArray(rawPayload.models)
  ) {
    for (const [key, item] of Object.entries<any>(rawPayload.models)) {
      const parsed = parseModelMetadataSafely(item, key);
      result[key] = parsed;
      if (parsed.id && !result[parsed.id]) {
        result[parsed.id] = parsed;
      }
    }
    return result;
  }

  // Case 2: has .providers object
  if (
    rawPayload.providers &&
    typeof rawPayload.providers === "object" &&
    !Array.isArray(rawPayload.providers)
  ) {
    for (const [providerId, providerObj] of Object.entries<any>(
      rawPayload.providers,
    )) {
      if (providerObj?.models && typeof providerObj.models === "object") {
        for (const [modelId, modelObj] of Object.entries<any>(
          providerObj.models,
        )) {
          const fullKey = `${providerId}/${modelId}`;
          const parsed = parseModelMetadataSafely(
            modelObj,
            fullKey,
            providerId,
          );
          result[fullKey] = parsed;
          if (!result[modelId]) {
            result[modelId] = parsed;
          }
        }
      }
    }
    return result;
  }

  // Case 3: top-level providers map
  let hasProviderWithModels = false;
  for (const [key, val] of Object.entries<any>(rawPayload)) {
    if (
      val &&
      typeof val === "object" &&
      val.models &&
      typeof val.models === "object"
    ) {
      hasProviderWithModels = true;
      for (const [modelId, modelObj] of Object.entries<any>(val.models)) {
        const fullKey = `${key}/${modelId}`;
        const parsed = parseModelMetadataSafely(modelObj, fullKey, key);
        result[fullKey] = parsed;
        if (!result[modelId]) {
          result[modelId] = parsed;
        }
      }
    }
  }

  if (hasProviderWithModels) {
    return result;
  }

  // Case 4: direct dictionary of models
  for (const [key, item] of Object.entries<any>(rawPayload)) {
    const parsed = parseModelMetadataSafely(item, key);
    result[key] = parsed;
    if (parsed.id && !result[parsed.id]) {
      result[parsed.id] = parsed;
    }
  }

  return result;
}

const initialCatalog = parseModelsDevCatalog(snapshot);

export interface ModelStoreState {
  models: Record<string, ModelMetadata>;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number;
}

export const useModelStore = createPersistStore(
  {
    models: initialCatalog,
    loading: false,
    error: null as string | null,
    lastFetchedAt: 0,
  },
  (set, get) => ({
    getModel(modelId: string): ModelMetadata | undefined {
      if (!modelId || typeof modelId !== "string") return undefined;
      const state = get();
      const models = state.models;

      // 1. Direct key match
      if (models[modelId]) return models[modelId];

      // 2. Direct key lowercase match
      const lowerId = modelId.toLowerCase().trim();
      if (models[lowerId]) return models[lowerId];

      // 3. Match by id or name property
      const all = Object.values(models);
      let found = all.find(
        (m) =>
          m.id === modelId ||
          m.id.toLowerCase() === lowerId ||
          m.name === modelId ||
          m.name.toLowerCase() === lowerId,
      );
      if (found) return found;

      // 4. If modelId has slash (e.g. google/gemini-3-pro), try short id (gemini-3-pro)
      if (modelId.includes("/")) {
        const shortId = modelId.split("/")[1];
        if (models[shortId]) return models[shortId];
        found = all.find(
          (m) =>
            m.id === shortId || m.id.toLowerCase() === shortId.toLowerCase(),
        );
        if (found) return found;
      }

      // 5. If modelId does not have slash (e.g. gemini-3-pro), try matching suffix
      found = all.find(
        (m) =>
          m.id.toLowerCase().endsWith("/" + lowerId) ||
          m.name.toLowerCase().endsWith("/" + lowerId),
      );
      if (found) return found;

      return undefined;
    },

    getProviderModels(provider: string): ModelMetadata[] {
      if (!provider || typeof provider !== "string") return [];
      const state = get();
      const lowerProvider = provider.toLowerCase().trim();
      const all = Object.values(state.models);

      const seenIds = new Set<string>();
      const results: ModelMetadata[] = [];

      for (const model of all) {
        const modelProvider = (model.provider || "").toLowerCase().trim();
        if (
          modelProvider === lowerProvider ||
          model.id.toLowerCase().startsWith(lowerProvider + "/")
        ) {
          const uniqueKey = `${model.provider}/${model.id}`;
          if (!seenIds.has(uniqueKey) && !seenIds.has(model.id)) {
            seenIds.add(uniqueKey);
            seenIds.add(model.id);
            results.push(model);
          }
        }
      }

      return results;
    },

    getAllModels(): ModelMetadata[] {
      const state = get();
      const all = Object.values(state.models);
      const seen = new Set<string>();
      const results: ModelMetadata[] = [];

      for (const model of all) {
        const key = `${model.provider}/${model.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(model);
        }
      }

      return results;
    },

    isLoaded(): boolean {
      const state = get();
      return Object.keys(state.models).length > 0 && !state.loading;
    },

    setModels(models: Record<string, ModelMetadata>) {
      set({ models });
    },

    async fetchModels(force = false) {
      const state = get();
      const now = Date.now();
      if (
        !force &&
        Object.keys(state.models).length > 0 &&
        now - state.lastFetchedAt < 3600 * 1000
      ) {
        return;
      }

      set({ loading: true, error: null });

      try {
        let rawCatalog: any = null;

        // Strategy 1: @opencode-ai/models client
        try {
          if (
            typeof Models !== "undefined" &&
            typeof Models.make === "function"
          ) {
            const client = Models.make();
            if (typeof client.catalog === "function") {
              rawCatalog = await client.catalog();
            }
          }
        } catch (e) {
          console.warn(
            "[ModelStore] Failed to fetch via @opencode-ai/models client:",
            e,
          );
        }

        // Strategy 2: Direct fetch from https://models.dev/api.json
        if (!rawCatalog) {
          try {
            const controller =
              typeof AbortController !== "undefined"
                ? new AbortController()
                : null;
            const timer = controller
              ? setTimeout(() => controller.abort(), 5000)
              : null;
            const res = await fetch("https://models.dev/api.json", {
              signal: controller ? controller.signal : undefined,
              headers: { Accept: "application/json" },
            });
            if (timer) clearTimeout(timer);
            if (res.ok) {
              rawCatalog = await res.json();
            }
          } catch (e) {
            console.warn(
              "[ModelStore] Failed to fetch from models.dev api.json:",
              e,
            );
          }
        }

        // Strategy 3: Bundled snapshot fallback
        if (!rawCatalog) {
          console.info(
            "[ModelStore] Using bundled @opencode-ai/models/snapshot fallback",
          );
          rawCatalog = snapshot;
        }

        const parsed = parseModelsDevCatalog(rawCatalog);
        if (Object.keys(parsed).length > 0) {
          set({
            models: parsed,
            loading: false,
            error: null,
            lastFetchedAt: Date.now(),
          });
        } else {
          throw new Error("Parsed models catalog is empty");
        }
      } catch (err: any) {
        console.error("[ModelStore] Failed to load models catalog:", err);
        const fallbackParsed = parseModelsDevCatalog(snapshot);
        set({
          models:
            Object.keys(fallbackParsed).length > 0
              ? fallbackParsed
              : get().models,
          loading: false,
          error: err?.message || "Failed to load models catalog",
        });
      }
    },

    reset() {
      set({
        models: initialCatalog,
        loading: false,
        error: null,
        lastFetchedAt: 0,
      });
    },
  }),
  {
    name: StoreKey.Models,
    version: 1.0,
  },
);

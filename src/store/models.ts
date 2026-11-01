import { create } from "zustand";
import snapshot from "@opencode-ai/models/snapshot";
import defaultProvidersJson from "../../public/providers.json";

export interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  providerName?: string;
  env?: string[];
  npm?: string;
  api?: string;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  tool_call?: boolean;
  hasTools: boolean;
  attachment?: boolean;
  hasVision: boolean;
  reasoning?: boolean;
  hasReasoning: boolean;
  reasoning_options?: any[];
  reasoningType?: "level" | "budget";
  contextLimit: number;
  outputLimit: number;
  supportsTemperature?: boolean;
  cost?: {
    input: number;
    output: number;
    cache_read?: number;
    [key: string]: any;
  };
  description?: string;
  family?: string;
  modelInfo?: any;
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
      providerName: defaultProvider || extractedProvider || "custom",
      contextLimit: 4096,
      outputLimit: 4096,
      hasVision: false,
      hasReasoning: false,
      hasTools: true,
      tool_call: true,
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

  const providerName =
    raw.providerName || raw.provider || defaultProvider || provider;

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
    raw.modalities.input.some((m: string) =>
      ["image", "video", "audio", "pdf", "file"].includes(
        String(m).toLowerCase(),
      ),
    )
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
  let tool_call = true;
  if (typeof raw.hasTools === "boolean") {
    hasTools = raw.hasTools;
    tool_call = raw.hasTools;
  }
  if (raw.tool_call !== undefined) {
    tool_call = Boolean(raw.tool_call);
    hasTools = Boolean(raw.tool_call);
  }

  // Temperature Support
  let supportsTemperature = true;
  if (typeof raw.supportsTemperature === "boolean") {
    supportsTemperature = raw.supportsTemperature;
  } else if (raw.temperature !== undefined) {
    supportsTemperature = raw.temperature !== false;
  }

  const env = Array.isArray(raw.env) ? raw.env : undefined;
  const npm = typeof raw.npm === "string" ? raw.npm : undefined;
  const api = typeof raw.api === "string" ? raw.api : undefined;

  return {
    id,
    name,
    provider,
    providerName,
    env,
    npm,
    api,
    modalities: raw.modalities,
    attachment: raw.attachment,
    tool_call,
    hasTools,
    contextLimit,
    outputLimit,
    hasVision,
    hasReasoning,
    reasoning: raw.reasoning ?? hasReasoning,
    reasoning_options: raw.reasoning_options,
    reasoningType,
    supportsTemperature,
    cost: raw.cost,
    description: raw.description,
    family: raw.family,
    modelInfo: raw,
  };
}

export function parseModelsDevCatalog(
  rawPayload: any,
): Record<string, ModelMetadata> {
  const result: Record<string, ModelMetadata> = {};
  if (!rawPayload || typeof rawPayload !== "object") return result;

  // Case 0: Array of providers (like public/providers.json)
  if (Array.isArray(rawPayload)) {
    for (const providerObj of rawPayload) {
      if (!providerObj || typeof providerObj !== "object") continue;
      const providerId = providerObj.id || "custom";
      const providerName = providerObj.name || providerId;
      const providerEnv = Array.isArray(providerObj.env) ? providerObj.env : [];
      const providerNpm = providerObj.npm;
      const providerApi = providerObj.api;

      if (providerObj.models && typeof providerObj.models === "object") {
        for (const [modelKey, modelObj] of Object.entries<any>(
          providerObj.models,
        )) {
          const fullKey = `${providerId}/${modelKey}`;
          const parsed = parseModelMetadataSafely(
            {
              ...modelObj,
              provider: providerId,
              providerName,
              env: modelObj.env || providerEnv,
              npm: modelObj.npm || providerNpm,
              api: modelObj.api || providerApi,
            },
            fullKey,
            providerId,
          );
          result[fullKey] = parsed;
          if (!result[modelKey]) {
            result[modelKey] = parsed;
          }
          if (parsed.id && !result[parsed.id]) {
            result[parsed.id] = parsed;
          }
        }
      }
    }
    return result;
  }

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
            {
              ...modelObj,
              provider: providerId,
              providerName: providerObj.name || providerId,
              env: modelObj.env || providerObj.env,
              npm: modelObj.npm || providerObj.npm,
              api: modelObj.api || providerObj.api,
            },
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
        const parsed = parseModelMetadataSafely(
          {
            ...modelObj,
            provider: key,
            providerName: val.name || key,
            env: modelObj.env || val.env,
            npm: modelObj.npm || val.npm,
            api: modelObj.api || val.api,
          },
          fullKey,
          key,
        );
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

const initialCatalog = {
  ...parseModelsDevCatalog(snapshot),
  ...parseModelsDevCatalog(defaultProvidersJson),
};

export interface ModelStoreState {
  models: Record<string, ModelMetadata>;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number;
}

export interface ModelStore extends ModelStoreState {
  getModel: (modelId: string) => ModelMetadata | undefined;
  getProviderModels: (provider: string) => ModelMetadata[];
  getAllModels: () => ModelMetadata[];
  isLoaded: () => boolean;
  setModels: (models: Record<string, ModelMetadata>) => void;
  fetchModels: (force?: boolean) => Promise<void>;
  reset: () => void;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: initialCatalog,
  loading: false,
  error: null as string | null,
  lastFetchedAt: 0,

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
        (m) => m.id === shortId || m.id.toLowerCase() === shortId.toLowerCase(),
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

  async fetchModels(_force = true) {
    const state = get();
    if (state.loading) {
      return;
    }

    set({ loading: true, error: null });

    try {
      const res = await fetch(`/providers.json?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to load /providers.json: HTTP ${res.status}`);
      }
      const rawCatalog = await res.json();
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
      console.error("[ModelStore] Failed to load /providers.json:", err);
      const fallbackParsed = parseModelsDevCatalog(defaultProvidersJson);
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
}));

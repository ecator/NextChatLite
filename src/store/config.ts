import { LLMModel } from "../client/api";
import defaultProvidersJson from "../../public/providers.json";
import { getModelProvider } from "../utils/model";
import { isModelInModelsJson, validateModelOrFallback } from "./models";
import { getClientConfig } from "../config/client";
import {
  DEFAULT_INPUT_TEMPLATE,
  DEFAULT_MODELS,
  DEFAULT_SIDEBAR_WIDTH,
  StoreKey,
  ServiceProvider,
} from "../constant";
import { createPersistStore } from "../utils/store";

export type ModelType = (typeof DEFAULT_MODELS)[number]["name"];

export enum SubmitKey {
  Enter = "Enter",
  CtrlEnter = "Ctrl + Enter",
  ShiftEnter = "Shift + Enter",
  AltEnter = "Alt + Enter",
  MetaEnter = "Meta + Enter",
}

export enum Theme {
  Auto = "auto",
  Dark = "dark",
  Light = "light",
}

const config = getClientConfig();

function getInitialModelAndProvider(): {
  model: ModelType;
  providerName: ServiceProvider;
} {
  const config = getClientConfig();
  const rawDefault = (config?.defaultModel || "").trim();
  if (rawDefault) {
    const [m, p] = getModelProvider(rawDefault);
    if (m) {
      return {
        model: m as ModelType,
        providerName: (p || "Google") as ServiceProvider,
      };
    }
  }

  try {
    const rawData: any = defaultProvidersJson;
    const providers = Array.isArray(rawData)
      ? rawData
      : Object.values(rawData || {});
    if (providers.length > 0) {
      const p = providers[0];
      const pName = p.name || p.id || "Google";
      const modelKeys = p.models ? Object.keys(p.models) : [];
      if (modelKeys.length > 0) {
        return {
          model: modelKeys[0] as ModelType,
          providerName: pName as ServiceProvider,
        };
      }
    }
  } catch (e) {
    // fallback
  }

  return {
    model: "gemini-3.5-flash" as ModelType,
    providerName: "Google" as ServiceProvider,
  };
}

const initialModel = getInitialModelAndProvider();

export const DEFAULT_CONFIG = {
  lastUpdate: Date.now(), // timestamp, to merge state

  submitKey: SubmitKey.Enter,
  avatar: "1f603",
  fontSize: 14,
  fontFamily: "",
  theme: Theme.Auto as Theme,
  tightBorder: !!config?.isApp,
  sendPreviewBubble: true,
  enableAutoGenerateTitle: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,

  enableArtifacts: true, // show artifacts config

  enableCodeFold: true, // code fold config

  disablePromptHint: false,

  dontShowMaskSplashScreen: false, // dont show splash screen when create chat
  hideBuiltinMasks: false, // dont add builtin masks

  customModels: "",
  models: DEFAULT_MODELS as any as LLMModel[],

  modelConfig: {
    model: initialModel.model,
    providerName: initialModel.providerName,
    temperature: 0.5,
    top_p: 1,
    max_tokens: 8192,
    presence_penalty: 0,
    frequency_penalty: 0,
    sendMemory: false,
    historyMessageCount: 20,
    compressMessageLengthThreshold: 8000,
    compressModel: "",
    compressProviderName: "",
    enableInjectSystemPrompts: true,
    template: config?.template ?? DEFAULT_INPUT_TEMPLATE,
    thinkingLevel: undefined as
      "minimal" | "low" | "medium" | "high" | undefined,
    thinkingBudget: undefined as number | undefined,
    includeThinking: true,
  },
};

export type ChatConfig = typeof DEFAULT_CONFIG;

export type ModelConfig = ChatConfig["modelConfig"];

export function limitNumber(
  x: number,
  min: number,
  max: number,
  defaultValue: number,
) {
  if (isNaN(x)) {
    return defaultValue;
  }

  return Math.min(max, Math.max(min, x));
}

export const ModalConfigValidator = {
  model(x: string) {
    return x as ModelType;
  },
  max_tokens(x: number) {
    return limitNumber(x, 0, 512000, 1024);
  },
  presence_penalty(x: number) {
    return limitNumber(x, -2, 2, 0);
  },
  frequency_penalty(x: number) {
    return limitNumber(x, -2, 2, 0);
  },
  temperature(x: number) {
    return limitNumber(x, 0, 2, 1);
  },
  top_p(x: number) {
    return limitNumber(x, 0, 1, 1);
  },
};

export const useAppConfig = createPersistStore(
  { ...DEFAULT_CONFIG },
  (set, get) => ({
    reset() {
      set(() => ({ ...DEFAULT_CONFIG }));
    },

    mergeModels(newModels: LLMModel[]) {
      if (!newModels || newModels.length === 0) {
        return;
      }

      const oldModels = get().models;
      const modelMap: Record<string, LLMModel> = {};

      for (const model of oldModels) {
        model.available = false;
        modelMap[`${model.name}@${model?.provider?.id}`] = model;
      }

      for (const model of newModels) {
        model.available = true;
        modelMap[`${model.name}@${model?.provider?.id}`] = model;
      }

      set(() => ({
        models: Object.values(modelMap),
      }));
    },

    allModels() {},
  }),
  {
    name: StoreKey.Config,
    version: 4.4,

    merge(persistedState: any, currentState: any) {
      const state = persistedState as ChatConfig | undefined;
      if (!state) return { ...currentState };
      const models = currentState.models.slice();
      state.models.forEach((pModel) => {
        const idx = models.findIndex(
          (v: any) => v.name === pModel.name && v.provider === pModel.provider,
        );
        if (idx !== -1) models[idx] = pModel;
        else models.push(pModel);
      });
      return { ...currentState, ...state, models: models };
    },

    migrate(persistedState: any, version: number) {
      const state = persistedState as ChatConfig;

      if (version < 3.4) {
        state.modelConfig.sendMemory = true;
        state.modelConfig.historyMessageCount = 4;
        state.modelConfig.compressMessageLengthThreshold = 1000;
        state.modelConfig.frequency_penalty = 0;
        state.modelConfig.top_p = 1;
        state.modelConfig.template = DEFAULT_INPUT_TEMPLATE;
        state.dontShowMaskSplashScreen = false;
        state.hideBuiltinMasks = false;
      }

      if (version < 3.5) {
        state.customModels = "claude,claude-100k";
      }

      if (version < 3.6) {
        state.modelConfig.enableInjectSystemPrompts = true;
      }

      if (version < 3.7) {
        state.enableAutoGenerateTitle = true;
      }

      if (version < 3.8) {
        state.lastUpdate = Date.now();
      }

      if (version < 3.9) {
        state.modelConfig.template =
          state.modelConfig.template !== DEFAULT_INPUT_TEMPLATE
            ? state.modelConfig.template
            : (config?.template ?? DEFAULT_INPUT_TEMPLATE);
      }

      if (version < 4.1) {
        state.modelConfig.compressModel =
          DEFAULT_CONFIG.modelConfig.compressModel;
        state.modelConfig.compressProviderName =
          DEFAULT_CONFIG.modelConfig.compressProviderName;
      }

      if (version < 4.2) {
        if (state.modelConfig.model === "gpt-4o-mini") {
          state.modelConfig.model = DEFAULT_CONFIG.modelConfig.model;
          state.modelConfig.providerName =
            DEFAULT_CONFIG.modelConfig.providerName;
        }
      }

      if (version < 4.3) {
        state.modelConfig.sendMemory = false;
      }

      if (version < 4.4) {
        if (state.modelConfig.includeThinking === undefined) {
          state.modelConfig.includeThinking = true;
        }
      }

      if (!isModelInModelsJson(state.modelConfig?.model)) {
        const validated = validateModelOrFallback(
          state.modelConfig?.model,
          state.modelConfig?.providerName,
        );
        state.modelConfig.model = validated.model as ModelType;
        state.modelConfig.providerName =
          validated.providerName as ServiceProvider;
      }

      return state as any;
    },
  },
);

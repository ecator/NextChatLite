import defaultProvidersJson from "../../public/providers.json";
import { DEFAULT_SYSTEM_TEMPLATE } from "../constant";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PROXY_URL?: string; // docker only

      BUILD_MODE?: "standalone" | "export";
      BUILD_APP?: string; // is building desktop app

      DEFAULT_MODEL?: string; // to control default model in every new chat window

      // custom template for preprocessing user input
      DEFAULT_INPUT_TEMPLATE?: string;

      // custom default system template
      NEXTCHATLITE_DEFAULT_SYSTEM_TEMPLATE?: string;

      // custom title and subtitle
      NEXTCHATLITE_TITLE?: string;
      NEXTCHATLITE_SUBTITLE?: string;

      // custom help url
      NEXTCHATLITE_HELP_URL?: string;

      // Azure OpenAI environment variables
      AZURE_API_KEY?: string;
      AZURE_OPENAI_API_KEY?: string;
      AZURE_URL?: string;
      AZURE_OPENAI_ENDPOINT?: string;
      AZURE_ENDPOINT?: string;
      AZURE_RESOURCE_NAME?: string;
      AZURE_API_VERSION?: string;

      [key: string]: string | undefined;
    }
  }
}

export interface ServerConfig {
  title: string;
  subTitle: string;
  helpUrl?: string;
  proxyUrl?: string;
  defaultModel: string;
  defaultSystemTemplate?: string;
  [key: string]: any;
}

export function getDefaultModel(): string {
  let defaultModel = (process.env.DEFAULT_MODEL || "").trim();

  let firstModel = "google/gemini-3.5-flash";
  let firstProviderId = "google";
  const providerMap = new Map<string, string>();

  try {
    const rawData: any = defaultProvidersJson;
    let providers: any[] = [];
    if (Array.isArray(rawData)) {
      providers = rawData;
    } else if (typeof rawData === "object" && rawData !== null) {
      providers = Object.entries(rawData).map(([id, val]: [string, any]) => ({
        id: val.id || id,
        ...val,
      }));
    }

    if (providers.length > 0) {
      firstProviderId = providers[0]?.id || "google";
      const firstModels = providers[0]?.models;
      if (firstModels && typeof firstModels === "object") {
        const modelKeys = Object.keys(firstModels);
        if (modelKeys.length > 0) {
          firstModel = `${firstProviderId}/${modelKeys[0]}`;
        }
      }

      for (const p of providers) {
        const pId = p.id;
        if (pId && p.models && typeof p.models === "object") {
          for (const mId of Object.keys(p.models)) {
            if (!providerMap.has(mId)) {
              providerMap.set(mId, pId);
            }
          }
        }
      }
    }
  } catch (e) {
    console.error(
      "[Server Config] failed to resolve default model from providers.json",
      e,
    );
  }

  if (!defaultModel) {
    return firstModel;
  }

  if (defaultModel.includes("@")) {
    const [m, p] = defaultModel.split(/@(?!.*@)/);
    return `${p}/${m}`;
  }

  if (defaultModel.includes("/")) {
    return defaultModel;
  }

  const matchedProvider = providerMap.get(defaultModel);
  if (matchedProvider) {
    return `${matchedProvider}/${defaultModel}`;
  }

  return `${firstProviderId}/${defaultModel}`;
}

export const getServerSideConfig = (): ServerConfig => {
  if (typeof process === "undefined") {
    throw Error(
      "[Server Config] you are importing a nodejs-only module outside of nodejs",
    );
  }

  const defaultModel = getDefaultModel();

  return {
    title: process.env.NEXTCHATLITE_TITLE || "NextChatLite",
    subTitle:
      process.env.NEXTCHATLITE_SUBTITLE || "Build your own AI assistant.",
    helpUrl: process.env.NEXTCHATLITE_HELP_URL?.trim() || undefined,
    defaultSystemTemplate:
      process.env.NEXTCHATLITE_DEFAULT_SYSTEM_TEMPLATE ??
      DEFAULT_SYSTEM_TEMPLATE,

    proxyUrl: process.env.PROXY_URL,
    defaultModel,
  };
};

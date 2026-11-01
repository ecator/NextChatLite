import defaultProvidersJson from "../public/providers.json";

export const OWNER = "ecator";
export const REPO = "NextChatLite";
export const REPO_URL = `https://github.com/${OWNER}/${REPO}`;
export const PLUGINS_REPO_URL = `https://github.com/${OWNER}/NextChat-Awesome-Plugins`;
export const ISSUE_URL = `https://github.com/${OWNER}/${REPO}/issues`;

export const OPENAI_BASE_URL = "https://api.openai.com";
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/";
export const BAIDU_BASE_URL = "https://aip.baidubce.com";
export const BYTEDANCE_BASE_URL = "https://ark.cn-beijing.volces.com";
export const ALIBABA_BASE_URL = "https://dashscope.aliyuncs.com/api/";
export const TENCENT_BASE_URL = "https://hunyuan.tencentcloudapi.com";
export const MOONSHOT_BASE_URL = "https://api.moonshot.ai";
export const IFLYTEK_BASE_URL = "https://spark-api-open.xf-yun.com";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const XAI_BASE_URL = "https://api.x.ai";
export const CHATGLM_BASE_URL = "https://open.bigmodel.cn";
export const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn";
export const AI302_BASE_URL = "https://api.302.ai";

export const CACHE_URL_PREFIX = "/api/cache";

export enum Path {
  Home = "/",
  Chat = "/chat",
  Settings = "/settings",
  NewChat = "/new-chat",
  Masks = "/masks",
  Plugins = "/plugins",
  Auth = "/auth",
  Artifacts = "/artifacts",
  SearchChat = "/search-chat",
}

export enum ApiPath {
  Chat = "/api/chat",
  Config = "/api/config",
  Proxy = "/api/proxy",
}

export enum SlotID {
  AppBody = "app-body",
  CustomModel = "custom-model",
}

export enum FileName {
  Masks = "masks.json",
  Prompts = "prompts.json",
}

export enum StoreKey {
  Chat = "nextchat-lite-chat",
  Plugin = "nextchat-lite-plugin",
  Access = "nextchat-lite-access",
  Config = "nextchat-lite-config",
  Mask = "nextchat-lite-mask",
  Prompt = "nextchat-lite-prompt",
  Update = "nextchat-lite-update",
  Sync = "nextchat-lite-sync",
  Models = "nextchat-lite-models",
}

export const DEFAULT_SIDEBAR_WIDTH = 300;
export const MAX_SIDEBAR_WIDTH = 500;
export const MIN_SIDEBAR_WIDTH = 230;
export const NARROW_SIDEBAR_WIDTH = 100;

export const ACCESS_CODE_PREFIX = "nk-";

export const UNFINISHED_INPUT = (id: string) => "unfinished-input-" + id;

export const REQUEST_TIMEOUT_MS = 60000;
export const REQUEST_TIMEOUT_MS_FOR_THINKING = REQUEST_TIMEOUT_MS * 5;

export const EXPORT_MESSAGE_CLASS_NAME = "export-markdown";

export enum ServiceProvider {
  OpenAI = "OpenAI",
  Azure = "Azure",
  Google = "Google",
  Anthropic = "Anthropic",
  Baidu = "Baidu",
  ByteDance = "ByteDance",
  Alibaba = "Alibaba",
  Tencent = "Tencent",
  Moonshot = "Moonshot",
  Iflytek = "Iflytek",
  XAI = "XAI",
  ChatGLM = "ChatGLM",
  DeepSeek = "DeepSeek",
  SiliconFlow = "SiliconFlow",
  "302.AI" = "302.AI",
}

export enum GoogleSafetySettingsThreshold {
  BLOCK_NONE = "BLOCK_NONE",
  BLOCK_ONLY_HIGH = "BLOCK_ONLY_HIGH",
  BLOCK_MEDIUM_AND_ABOVE = "BLOCK_MEDIUM_AND_ABOVE",
  BLOCK_LOW_AND_ABOVE = "BLOCK_LOW_AND_ABOVE",
}

export enum ModelProvider {
  GPT = "GPT",
  GeminiPro = "GeminiPro",
  Claude = "Claude",
  Ernie = "Ernie",
  Doubao = "Doubao",
  Qwen = "Qwen",
  Hunyuan = "Hunyuan",
  Moonshot = "Moonshot",
  Iflytek = "Iflytek",
  XAI = "XAI",
  ChatGLM = "ChatGLM",
  DeepSeek = "DeepSeek",
  SiliconFlow = "SiliconFlow",
  "302.AI" = "302.AI",
}

export const DEFAULT_INPUT_TEMPLATE = `{{input}}`;
export const DEFAULT_SYSTEM_TEMPLATE = `
You are a helpful AI assistant trained by {{ServiceProvider}}.
Knowledge cutoff: {{cutoff}}
Current model: {{model}}
Current time: {{time}}
Latex inline: \\(x^2\\) 
Latex block: $$e=mc^2$$
`;

export const SUMMARIZE_MODEL = "gpt-5-mini";
export const GEMINI_SUMMARIZE_MODEL = "gemini-3.1-flash-lite";
export const DEEPSEEK_SUMMARIZE_MODEL = "deepseek-chat";

export const KnowledgeCutOffDate: Record<string, string> = {
  default: "2024-01",
  "gpt-4o": "2023-10",
  "gpt-4o-mini": "2023-10",
  "gemini-pro": "2023-12",
  "deepseek-chat": "2024-07",
};

export const VISION_MODEL_REGEXES = [
  /vision/,
  /gpt-4o/,
  /gpt-4\.1/,
  /claude.*[34]/,
  /gemini-1\.5/,
  /gemini-exp/,
  /gemini-2\.[05]/,
  /learnlm/,
  /qwen-vl/,
  /qwen2-vl/,
  /gpt-4-turbo(?!.*preview)/,
  /^dall-e-3$/,
  /glm-4v/,
  /vl/i,
  /o3/,
  /o4-mini/,
  /grok-4/i,
  /gpt-5/,
];

export const EXCLUDE_VISION_MODEL_REGEXES = [/claude-3-5-haiku-20241022/];

let seq = 1000;
export const DEFAULT_MODELS = [
  ...defaultProvidersJson.flatMap((p: any, pIndex: number) =>
    Object.keys(p.models || {}).map((modelName) => ({
      name: modelName,
      available: true,
      sorted: seq++,
      provider: {
        id: p.id,
        providerName: p.name || p.id,
        providerType: p.id,
        sorted: pIndex + 1,
      },
    })),
  ),
  // Built-in fallbacks for test & backward compatibility
  {
    name: "gpt-4",
    available: true,
    sorted: seq++,
    provider: {
      id: "openai",
      providerName: "OpenAI",
      providerType: "openai",
      sorted: 1,
    },
  },
  {
    name: "gpt-3.5-turbo",
    available: true,
    sorted: seq++,
    provider: {
      id: "openai",
      providerName: "OpenAI",
      providerType: "openai",
      sorted: 1,
    },
  },
];

export const CHAT_PAGE_SIZE = 15;

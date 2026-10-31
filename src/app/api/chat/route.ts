import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  streamText,
  extractReasoningMiddleware,
  wrapLanguageModel,
  LanguageModel,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getServerSideConfig } from "@/config/server";
import { convertOpenApiToAiTools } from "./tools";

export const chatApiPayloadSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant", "tool"]),
        content: z.union([
          z.string(),
          z.array(
            z.object({
              type: z.enum(["text", "image"]),
              text: z.string().optional(),
              image: z.string().optional(),
            }),
          ),
        ]),
      }),
    )
    .min(1, "messages must be a non-empty array"),
  model: z.string().min(1, "model must be a non-empty string"),
  provider: z.string().min(1, "provider must be specified"),
  modelConfig: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      top_p: z.number().min(0).max(1).optional(),
      max_tokens: z.number().positive().optional(),
      reasoningConfig: z
        .object({
          thinkingLevel: z
            .enum(["minimal", "low", "medium", "high"])
            .optional(),
          thinkingBudget: z.number().positive().optional(),
        })
        .optional(),
    })
    .optional(),
  customConfig: z
    .object({
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
  pluginIds: z.array(z.string()).optional(),
  plugins: z.array(z.any()).optional(),
});

export type ChatApiPayload = z.infer<typeof chatApiPayloadSchema>;

export function normalizeBaseUrl(url?: string): string | undefined {
  if (!url || url.trim() === "") return undefined;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Disallowed protocol: ${parsed.protocol}`);
    }
    const cleanUrl =
      `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(
        /\/+$/,
        "",
      );
    return cleanUrl;
  } catch (err: any) {
    if (err?.message?.includes("Disallowed protocol")) {
      throw err;
    }
    return trimmed.replace(/\/+$/, "");
  }
}

export function sanitizeError(errorMsg: string, secretKey?: string): string {
  if (!errorMsg) return "";
  let sanitized = errorMsg;
  if (secretKey && secretKey.trim().length > 0) {
    sanitized = sanitized.replaceAll(secretKey.trim(), "[REDACTED_API_KEY]");
  }
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9_-]{8,}/g, "[REDACTED_API_KEY]");
  return sanitized;
}

export function createLanguageModel(payload: ChatApiPayload): LanguageModel {
  const serverConfig = getServerSideConfig();
  const custom = payload.customConfig;
  const normalizedCustomUrl = normalizeBaseUrl(custom?.baseUrl);
  const providerLower = (payload.provider || "").toLowerCase();

  if (providerLower === "google" || providerLower.includes("gemini")) {
    const apiKey =
      custom?.apiKey?.trim() ||
      serverConfig.googleApiKey ||
      process.env.GOOGLE_API_KEY ||
      "";
    const baseURL =
      normalizedCustomUrl ||
      serverConfig.googleUrl ||
      "https://generativelanguage.googleapis.com/v1beta";
    const googleProvider = createGoogleGenerativeAI({ apiKey, baseURL });

    const thinkingBudget = payload.modelConfig?.reasoningConfig?.thinkingBudget;
    const thinkingConfig =
      thinkingBudget !== undefined && thinkingBudget > 0
        ? {
            thinkingBudget,
            includeThoughts: true,
          }
        : payload.modelConfig?.reasoningConfig
          ? { includeThoughts: true }
          : undefined;

    return (googleProvider as any)(payload.model, {
      thinkingConfig,
    });
  }

  if (providerLower === "anthropic" || providerLower.includes("claude")) {
    const apiKey =
      custom?.apiKey?.trim() ||
      serverConfig.anthropicApiKey ||
      process.env.ANTHROPIC_API_KEY ||
      "";
    const baseURL =
      normalizedCustomUrl ||
      serverConfig.anthropicUrl ||
      "https://api.anthropic.com/v1";
    const anthropicProvider = createAnthropic({ apiKey, baseURL });

    const budget = payload.modelConfig?.reasoningConfig?.thinkingBudget;
    const thinking =
      budget !== undefined && budget > 0
        ? { type: "enabled" as const, budgetTokens: budget }
        : undefined;

    return (anthropicProvider as any)(payload.model, {
      thinking,
    });
  }

  if (providerLower === "openai") {
    const apiKey =
      custom?.apiKey?.trim() ||
      serverConfig.apiKey ||
      process.env.OPENAI_API_KEY ||
      "";
    const baseURL =
      normalizedCustomUrl ||
      serverConfig.baseUrl ||
      "https://api.openai.com/v1";
    const openaiProvider = createOpenAI({ apiKey, baseURL });

    let reasoningEffort: "low" | "medium" | "high" | undefined;
    const level = payload.modelConfig?.reasoningConfig?.thinkingLevel;
    if (level === "low" || level === "minimal") reasoningEffort = "low";
    else if (level === "medium") reasoningEffort = "medium";
    else if (level === "high") reasoningEffort = "high";

    let model: LanguageModel = openaiProvider(payload.model as any, {
      reasoningEffort,
    });

    const modelNameLower = payload.model.toLowerCase();
    if (
      modelNameLower.includes("r1") ||
      modelNameLower.includes("reasoner") ||
      modelNameLower.includes("deepseek-r1")
    ) {
      model = wrapLanguageModel({
        model,
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    }

    return model;
  }

  // Custom and third-party OpenAI-compatible providers (DeepSeek, Moonshot, SiliconFlow, XAI, ChatGLM, Alibaba, etc.)
  let fallbackApiKey = serverConfig.apiKey || process.env.OPENAI_API_KEY || "";
  let fallbackBaseUrl = serverConfig.baseUrl || "https://api.openai.com/v1";

  if (providerLower.includes("deepseek")) {
    fallbackApiKey =
      serverConfig.deepseekApiKey ||
      process.env.DEEPSEEK_API_KEY ||
      fallbackApiKey;
    fallbackBaseUrl = serverConfig.deepseekUrl || "https://api.deepseek.com/v1";
  } else if (providerLower.includes("moonshot")) {
    fallbackApiKey =
      serverConfig.moonshotApiKey ||
      process.env.MOONSHOT_API_KEY ||
      fallbackApiKey;
    fallbackBaseUrl = serverConfig.moonshotUrl || "https://api.moonshot.ai/v1";
  } else if (providerLower.includes("siliconflow")) {
    fallbackApiKey =
      serverConfig.siliconFlowApiKey ||
      process.env.SILICONFLOW_API_KEY ||
      fallbackApiKey;
    fallbackBaseUrl =
      serverConfig.siliconFlowUrl || "https://api.siliconflow.cn/v1";
  } else if (providerLower.includes("xai")) {
    fallbackApiKey =
      serverConfig.xaiApiKey || process.env.XAI_API_KEY || fallbackApiKey;
    fallbackBaseUrl = serverConfig.xaiUrl || "https://api.x.ai/v1";
  } else if (
    providerLower.includes("chatglm") ||
    providerLower.includes("glm")
  ) {
    fallbackApiKey =
      serverConfig.chatglmApiKey ||
      process.env.CHATGLM_API_KEY ||
      fallbackApiKey;
    fallbackBaseUrl =
      serverConfig.chatglmUrl || "https://open.bigmodel.cn/api/paas/v4";
  } else if (providerLower.includes("alibaba")) {
    fallbackApiKey =
      serverConfig.alibabaApiKey ||
      process.env.ALIBABA_API_KEY ||
      fallbackApiKey;
    fallbackBaseUrl =
      serverConfig.alibabaUrl ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1";
  } else if (providerLower.includes("bytedance")) {
    fallbackApiKey =
      serverConfig.bytedanceApiKey ||
      process.env.BYTEDANCE_API_KEY ||
      fallbackApiKey;
    fallbackBaseUrl =
      serverConfig.bytedanceUrl || "https://ark.cn-beijing.volces.com/api/v3";
  } else if (providerLower.includes("302")) {
    fallbackApiKey =
      serverConfig.ai302ApiKey || process.env.AI302_API_KEY || fallbackApiKey;
    fallbackBaseUrl = serverConfig.ai302Url || "https://api.302.ai/v1";
  }

  const apiKey = custom?.apiKey?.trim() || fallbackApiKey;
  const baseURL = normalizedCustomUrl || fallbackBaseUrl;

  const customOpenaiProvider = createOpenAI({
    apiKey,
    baseURL,
    compatibility: "compatible",
    name: payload.provider,
  });

  let model: LanguageModel = customOpenaiProvider(payload.model as any);

  const modelNameLower = payload.model.toLowerCase();
  if (
    modelNameLower.includes("r1") ||
    modelNameLower.includes("reasoner") ||
    modelNameLower.includes("deepseek-r1")
  ) {
    model = wrapLanguageModel({
      model,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  }

  return model;
}

export async function POST(req: NextRequest) {
  let secretKey: string | undefined;
  try {
    const json = await req.json();
    const parseResult = chatApiPayloadSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: true,
          errors: parseResult.error.errors.map((e) => e.message),
        },
        { status: 400 },
      );
    }

    const payload = parseResult.data;
    secretKey = payload.customConfig?.apiKey;

    const model = createLanguageModel(payload);
    const tools = convertOpenApiToAiTools(payload.pluginIds, payload.plugins);

    const coreMessages = payload.messages.map((m) => {
      if (typeof m.content === "string") {
        return { role: m.role as any, content: m.content };
      }
      return {
        role: m.role as any,
        content: m.content.map((part) => {
          if (part.type === "text") {
            return { type: "text" as const, text: part.text || "" };
          }
          return { type: "image" as const, image: part.image || "" };
        }),
      };
    });

    const result = streamText({
      model,
      messages: coreMessages as any,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      maxSteps: 5,
      temperature: payload.modelConfig?.temperature,
      topP: payload.modelConfig?.top_p,
      maxTokens: payload.modelConfig?.max_tokens,
      abortSignal: req.signal,
    });

    return result.toDataStreamResponse({
      sendReasoning: true,
      sendUsage: true,
      getErrorMessage: (err) =>
        sanitizeError(
          err instanceof Error ? err.message : String(err),
          secretKey,
        ),
    });
  } catch (err: any) {
    console.error("[Chat Route Error]", err);
    const message = sanitizeError(
      err?.message || "Internal server error",
      secretKey,
    );
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}

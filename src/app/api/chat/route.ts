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
import { createVertex } from "@ai-sdk/google-vertex";
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
  provider: z.string().optional(),
  env: z.array(z.string()).optional(),
  npm: z.string().optional(),
  api: z.string().optional(),
  modelInfo: z.record(z.any()).optional(),
  modelConfig: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      top_p: z.number().min(0).max(1).optional(),
      max_tokens: z.number().positive().optional(),
      reasoningConfig: z
        .object({
          thinkingLevel: z
            .enum(["minimal", "low", "medium", "high", "none"])
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
  if (trimmed.startsWith("/api/")) return undefined;
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
  const custom = payload.customConfig;
  const normalizedUrl = normalizeBaseUrl(payload.api || custom?.baseUrl);
  const providerLower = (payload.provider || "").toLowerCase();

  // 1. Resolve API key from env in real-time
  let apiKey = "";
  if (Array.isArray(payload.env) && payload.env.length > 0) {
    for (const envVar of payload.env) {
      if (typeof envVar === "string" && envVar.trim()) {
        const val = process.env[envVar.trim()];
        if (val && val.trim().length > 0) {
          apiKey = val.trim();
          break;
        }
      }
    }
  }

  // Fallback to custom config apiKey if provided
  if (!apiKey && custom?.apiKey?.trim()) {
    apiKey = custom.apiKey.trim();
  }

  // Fallback to common provider env keys if not found
  if (!apiKey) {
    if (providerLower.includes("google") || providerLower.includes("gemini")) {
      apiKey =
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        "";
    } else if (
      providerLower.includes("anthropic") ||
      providerLower.includes("claude")
    ) {
      apiKey = process.env.ANTHROPIC_API_KEY || "";
    } else if (providerLower === "openai") {
      apiKey = process.env.OPENAI_API_KEY || "";
    } else if (providerLower.includes("deepseek")) {
      apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || "";
    } else if (providerLower.includes("moonshot")) {
      apiKey = process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY || "";
    } else if (providerLower.includes("siliconflow")) {
      apiKey =
        process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || "";
    } else if (providerLower.includes("xai")) {
      apiKey = process.env.XAI_API_KEY || process.env.OPENAI_API_KEY || "";
    } else if (
      providerLower.includes("chatglm") ||
      providerLower.includes("glm")
    ) {
      apiKey = process.env.CHATGLM_API_KEY || process.env.OPENAI_API_KEY || "";
    } else if (providerLower.includes("alibaba")) {
      apiKey = process.env.ALIBABA_API_KEY || process.env.OPENAI_API_KEY || "";
    } else if (providerLower.includes("bytedance")) {
      apiKey =
        process.env.BYTEDANCE_API_KEY || process.env.OPENAI_API_KEY || "";
    } else if (providerLower.includes("302")) {
      apiKey = process.env.AI302_API_KEY || process.env.OPENAI_API_KEY || "";
    }
  }

  // 2. Identify target package name
  let npmPackage = payload.npm?.trim();
  if (!npmPackage) {
    if (providerLower === "google" || providerLower.includes("gemini")) {
      npmPackage = "@ai-sdk/google";
    } else if (
      providerLower === "anthropic" ||
      providerLower.includes("claude")
    ) {
      npmPackage = "@ai-sdk/anthropic";
    } else if (providerLower === "openai") {
      npmPackage = "@ai-sdk/openai";
    } else if (providerLower.includes("vertex")) {
      npmPackage = "@ai-sdk/google-vertex";
    } else {
      npmPackage = "@ai-sdk/openai-compatible";
    }
  }

  let model: LanguageModel | undefined;

  // 3. Dispatch to preset or dynamically loaded package
  if (npmPackage === "@ai-sdk/google") {
    const baseURL =
      normalizedUrl || "https://generativelanguage.googleapis.com/v1beta";
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

  if (npmPackage === "@ai-sdk/anthropic") {
    const baseURL = normalizedUrl || "https://api.anthropic.com/v1";
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

  if (npmPackage === "@ai-sdk/openai") {
    const baseURL = normalizedUrl || "https://api.openai.com/v1";
    const openaiProvider = createOpenAI({ apiKey, baseURL });

    let reasoningEffort: "low" | "medium" | "high" | undefined;
    const level = payload.modelConfig?.reasoningConfig?.thinkingLevel;
    if (level === "low" || level === "minimal") reasoningEffort = "low";
    else if (level === "medium") reasoningEffort = "medium";
    else if (level === "high") reasoningEffort = "high";

    model = openaiProvider(payload.model as any, {
      reasoningEffort,
    });
  } else if (npmPackage === "@ai-sdk/openai-compatible") {
    let fallbackBaseUrl = "http://127.0.0.1:11434/v1";
    if (providerLower.includes("deepseek")) {
      fallbackBaseUrl = "https://api.deepseek.com/v1";
    } else if (providerLower.includes("moonshot")) {
      fallbackBaseUrl = "https://api.moonshot.ai/v1";
    } else if (providerLower.includes("siliconflow")) {
      fallbackBaseUrl = "https://api.siliconflow.cn/v1";
    } else if (providerLower.includes("xai")) {
      fallbackBaseUrl = "https://api.x.ai/v1";
    } else if (
      providerLower.includes("chatglm") ||
      providerLower.includes("glm")
    ) {
      fallbackBaseUrl = "https://open.bigmodel.cn/api/paas/v4";
    } else if (providerLower.includes("alibaba")) {
      fallbackBaseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";
    } else if (providerLower.includes("bytedance")) {
      fallbackBaseUrl = "https://ark.cn-beijing.volces.com/api/v3";
    } else if (providerLower.includes("302")) {
      fallbackBaseUrl = "https://api.302.ai/v1";
    }

    const baseURL = normalizedUrl || fallbackBaseUrl;
    const compatibleProvider = createOpenAI({
      name: payload.provider || "openai-compatible",
      apiKey: apiKey || "dummy-key",
      baseURL,
      compatibility: "compatible",
    });

    model = compatibleProvider(payload.model as any) as any;
  } else if (npmPackage === "@ai-sdk/google-vertex") {
    const vertexProvider = createVertex({
      baseURL: normalizedUrl,
      project:
        process.env.GOOGLE_VERTEX_PROJECT ||
        process.env.VERTEX_PROJECT ||
        "default-project",
      location:
        process.env.GOOGLE_VERTEX_LOCATION ||
        process.env.VERTEX_LOCATION ||
        "us-central1",
    });

    model = (vertexProvider as any)(payload.model);
  } else {
    // Dynamic import/require for other third-party npm packages
    try {
      const mod = require(npmPackage);
      const factory =
        mod.createOpenAICompatible ||
        mod.createOpenAI ||
        mod.default ||
        Object.values(mod).find((val) => typeof val === "function");
      if (factory && typeof factory === "function") {
        const customProvider = factory({
          apiKey,
          baseURL: normalizedUrl,
          name: payload.provider,
        });
        model = customProvider(payload.model);
      }
    } catch (e) {
      console.warn(
        `[Dynamic Provider] Failed to load package ${npmPackage}:`,
        e,
      );
    }

    if (!model) {
      // Fallback to OpenAI compatible
      const fallbackProvider = createOpenAI({
        apiKey,
        baseURL: normalizedUrl || "https://api.openai.com/v1",
        compatibility: "compatible",
        name: payload.provider || "custom",
      });
      model = fallbackProvider(payload.model as any);
    }
  }

  const modelNameLower = payload.model.toLowerCase();
  if (
    modelNameLower.includes("r1") ||
    modelNameLower.includes("reasoner") ||
    modelNameLower.includes("deepseek-r1")
  ) {
    model = wrapLanguageModel({
      model: model!,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  }

  return model!;
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

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  streamText,
  isStepCount,
  createUIMessageStreamResponse,
  toUIMessageStream,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAzure } from "@ai-sdk/azure";
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
              type: z.enum(["text", "image", "image_url"]),
              text: z.string().optional(),
              image: z.string().optional(),
              image_url: z
                .union([
                  z.string(),
                  z.object({
                    url: z.string(),
                  }),
                ])
                .optional(),
            }),
          ),
        ]),
      }),
    )
    .min(1, "messages must be a non-empty array"),
  model: z.string().min(1, "model must be a non-empty string"),
  provider: z.string().min(1, "provider must be a non-empty string"),
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
      apiVersion: z.string().optional(),
    })
    .passthrough()
    .optional(),
  providerOptions: z.record(z.any()).optional(),
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

export function formatErrorMessage(err: unknown, secretKey?: string): string {
  const message = err instanceof Error ? err.message : String(err);
  return sanitizeError(message, secretKey);
}

export type LanguageModelV4 = ReturnType<typeof wrapLanguageModel>;

export function createLanguageModel(payload: ChatApiPayload): LanguageModelV4 {
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
    if (providerLower.includes("azure")) {
      apiKey =
        payload.providerOptions?.azureApiKey ||
        payload.providerOptions?.azure?.apiKey ||
        process.env.AZURE_API_KEY ||
        process.env.AZURE_OPENAI_API_KEY ||
        process.env.OPENAI_API_KEY ||
        "";
    } else if (
      providerLower.includes("google") ||
      providerLower.includes("gemini")
    ) {
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
    if (providerLower === "azure" || providerLower.includes("azure")) {
      npmPackage = "@ai-sdk/azure";
    } else if (providerLower === "google" || providerLower.includes("gemini")) {
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

  let model: LanguageModelV4 | undefined;

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

    model = (googleProvider as any)(payload.model, {
      thinkingConfig,
    }) as LanguageModelV4;
  } else if (npmPackage === "@ai-sdk/anthropic") {
    const baseURL = normalizedUrl || "https://api.anthropic.com/v1";
    const anthropicProvider = createAnthropic({ apiKey, baseURL });

    const budget = payload.modelConfig?.reasoningConfig?.thinkingBudget;
    const thinking =
      budget !== undefined && budget > 0
        ? { type: "enabled" as const, budgetTokens: budget }
        : undefined;

    model = (anthropicProvider as any)(payload.model, {
      thinking,
    }) as LanguageModelV4;
  } else if (npmPackage === "@ai-sdk/openai") {
    const baseURL = normalizedUrl || "https://api.openai.com/v1";
    const openaiProvider = createOpenAI({ apiKey, baseURL });
    model = openaiProvider.chat(payload.model as any) as LanguageModelV4;
  } else if (npmPackage === "@ai-sdk/azure") {
    const azureUrl =
      payload.providerOptions?.azureUrl ||
      payload.providerOptions?.azure?.baseURL ||
      payload.providerOptions?.azure?.baseUrl ||
      normalizedUrl ||
      process.env.AZURE_URL ||
      process.env.AZURE_OPENAI_ENDPOINT ||
      process.env.AZURE_ENDPOINT;

    const resourceName =
      payload.providerOptions?.azureResourceName ||
      payload.providerOptions?.azure?.resourceName ||
      (!azureUrl ? process.env.AZURE_RESOURCE_NAME : undefined);

    const apiVersion =
      payload.providerOptions?.azureApiVersion ||
      payload.providerOptions?.azure?.apiVersion ||
      (payload.customConfig as any)?.apiVersion ||
      process.env.AZURE_API_VERSION ||
      "2024-08-01-preview";

    const azureApiKey =
      apiKey ||
      payload.providerOptions?.azureApiKey ||
      payload.providerOptions?.azure?.apiKey ||
      process.env.AZURE_API_KEY ||
      process.env.AZURE_OPENAI_API_KEY ||
      "dummy-key";

    const azureProvider = createAzure({
      apiKey: azureApiKey,
      baseURL: azureUrl || undefined,
      resourceName: resourceName || undefined,
      apiVersion,
      useDeploymentBasedUrls: true,
    });

    model = azureProvider.chat(payload.model) as LanguageModelV4;
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
    const compatibleProvider = createOpenAICompatible({
      name: payload.provider || "openai-compatible",
      apiKey: apiKey || "dummy-key",
      baseURL,
    });

    model = compatibleProvider.chatModel(payload.model) as LanguageModelV4;
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

    model = (vertexProvider as any)(payload.model) as LanguageModelV4;
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
          apiKey: apiKey || "dummy-key",
          baseURL: normalizedUrl,
          name: payload.provider,
        });
        if (typeof customProvider.chatModel === "function") {
          model = customProvider.chatModel(payload.model) as LanguageModelV4;
        } else if (typeof customProvider === "function") {
          model = customProvider(payload.model) as LanguageModelV4;
        }
      }
    } catch (e) {
      console.warn(
        `[Dynamic Provider] Failed to load package ${npmPackage}:`,
        e,
      );
    }

    if (!model) {
      // Fallback to OpenAI compatible
      const fallbackProvider = createOpenAICompatible({
        name: payload.provider || "custom",
        apiKey: apiKey || "dummy-key",
        baseURL: normalizedUrl || "https://api.openai.com/v1",
      });
      model = fallbackProvider.chatModel(payload.model) as LanguageModelV4;
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

    let hasEncounteredNonSystem = false;
    const coreMessages = payload.messages.map((m) => {
      let role = m.role as any;
      if (role === "system") {
        if (hasEncounteredNonSystem) {
          // System messages after conversation start are not supported by Gemini and other providers.
          // Fallback to "user" role to avoid UnsupportedFunctionalityError.
          role = "user";
        }
      } else {
        hasEncounteredNonSystem = true;
      }

      if (typeof m.content === "string") {
        return { role, content: m.content };
      }
      return {
        role,
        content: m.content.map((part) => {
          if (part.type === "text") {
            return { type: "text" as const, text: part.text || "" };
          }
          let imageUrl = part.image || "";
          if (!imageUrl && part.image_url) {
            imageUrl =
              typeof part.image_url === "string"
                ? part.image_url
                : part.image_url.url || "";
          }
          if (
            imageUrl &&
            !imageUrl.startsWith("data:") &&
            !imageUrl.startsWith("http://") &&
            !imageUrl.startsWith("https://")
          ) {
            const mime = imageUrl.startsWith("iVBOR")
              ? "image/png"
              : imageUrl.startsWith("R0lGOD")
                ? "image/gif"
                : imageUrl.startsWith("UklGR")
                  ? "image/webp"
                  : "image/jpeg";
            imageUrl = `data:${mime};base64,${imageUrl}`;
          }
          return { type: "image" as const, image: imageUrl };
        }),
      };
    });

    const thinkingLevel = payload.modelConfig?.reasoningConfig?.thinkingLevel;
    let reasoningEffort: "low" | "medium" | "high" | undefined;
    if (thinkingLevel === "low" || thinkingLevel === "minimal")
      reasoningEffort = "low";
    else if (thinkingLevel === "medium") reasoningEffort = "medium";
    else if (thinkingLevel === "high") reasoningEffort = "high";

    const providerOptions = {
      ...payload.providerOptions,
      ...(reasoningEffort ? { openai: { reasoningEffort } } : {}),
    };

    const result = streamText({
      model,
      messages: coreMessages as any,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      // maxSteps: 5 (migrated to stopWhen: isStepCount(5) for AI SDK v7)
      stopWhen: isStepCount(5),
      allowSystemInMessages: true,
      temperature: payload.modelConfig?.temperature,
      topP: payload.modelConfig?.top_p,
      maxOutputTokens: payload.modelConfig?.max_tokens,
      providerOptions,
      abortSignal: req.signal,
    });

    // AI SDK v7 UI Message Stream Response (migrated from result.toDataStreamResponse)
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        sendReasoning: true,
        onError: (err) => formatErrorMessage(err, secretKey),
      }),
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

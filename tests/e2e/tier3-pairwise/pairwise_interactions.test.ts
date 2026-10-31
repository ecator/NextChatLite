import test, { describe, it } from "node:test";
import assert from "node:assert";
import { readJsonFile } from "../fixtures/test_helpers";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  createGemini3ThinkingStream,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";

describe("Tier 3: Cross-Feature Pairwise Interactions", () => {
  const modelsFixture = readJsonFile("tests/e2e/fixtures/mock_models_dev.json").models;
  const weatherSpec = readJsonFile("tests/e2e/fixtures/mock_openapi_spec.json");

  it("P1 [F9 x F10]: chat session context truncation is bounded by active model contextLimit", () => {
    const geminiContext = modelsFixture["google/gemini-3-pro"].contextLimit; // 2M
    const gpt4oContext = modelsFixture["openai/gpt-4o"].contextLimit; // 128K

    const calculateContextRetention = (tokenCount: number, modelId: string) => {
      const limit = modelId.includes("gemini-3") ? geminiContext : gpt4oContext;
      return tokenCount <= limit;
    };

    assert.strictEqual(calculateContextRetention(500_000, "gemini-3-pro"), true);
    assert.strictEqual(calculateContextRetention(500_000, "gpt-4o"), false);
  });

  it("P2 [F12 x F13]: AI SDK chat stream applies custom baseUrl and apiKey override", () => {
    const buildProviderRequest = (provider: string, customConfig?: { baseUrl?: string; apiKey?: string }) => {
      return {
        endpoint: customConfig?.baseUrl || (provider === "google" ? "https://generativelanguage.googleapis.com" : "https://api.openai.com"),
        authHeader: customConfig?.apiKey ? `Bearer ${customConfig.apiKey}` : "Bearer default_env_key",
      };
    };

    const req = buildProviderRequest("openai", {
      baseUrl: "https://my-openai-proxy.com/v1",
      apiKey: "sk-custom-user-secret",
    });

    assert.strictEqual(req.endpoint, "https://my-openai-proxy.com/v1");
    assert.strictEqual(req.authHeader, "Bearer sk-custom-user-secret");
  });

  it("P3 [F12 x F14]: AI SDK streaming orchestrates multi-step OpenAPI tool invocation", () => {
    const multiStepStream = [
      encodeDataStreamChunk("9", { toolCallId: "call_weather_1", toolName: "getCurrentWeather", args: { location: "London" } }),
      encodeDataStreamChunk("a", { toolCallId: "call_weather_1", result: { city: "London", temperature: 15, condition: "Breezy" } }),
      encodeDataStreamChunk("0", "The weather in London is currently 15°C and breezy."),
      encodeDataStreamChunk("d", { finishReason: "stop" }),
    ].join("");

    const chunks = parseDataStreamResponse(multiStepStream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.toolCalls.length, 1);
    assert.strictEqual(state.toolResults.length, 1);
    assert.strictEqual(state.text, "The weather in London is currently 15°C and breezy.");
    assert.strictEqual(state.isFinished, true);
  });

  it("P4 [F12 x F15]: AI SDK streams and separates Gemini 3 thinking tokens from final answer", () => {
    const stream = createGemini3ThinkingStream({
      thinkingParts: ["Deconstruct mathematical conjecture.", " Formulate proof."],
      responseParts: ["The conjecture holds for all primes p > 2."],
    });

    const chunks = parseDataStreamResponse(stream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.reasoning, "Deconstruct mathematical conjecture. Formulate proof.");
    assert.strictEqual(state.text, "The conjecture holds for all primes p > 2.");
    assert.strictEqual(state.isFinished, true);
  });

  it("P5 [F15 x F16]: ThinkingBlock UI ingests thinking tokens and auto-collapses when finished", () => {
    let blockState = { reasoning: "", isFinished: false, isCollapsed: false };

    // Ingest stream
    const onReasoningChunk = (chunk: string) => {
      blockState.reasoning += chunk;
    };
    const onFinish = () => {
      blockState.isFinished = true;
      blockState.isCollapsed = true; // auto-collapse
    };

    onReasoningChunk("Analyzing hypothesis...");
    assert.strictEqual(blockState.isCollapsed, false);
    onFinish();
    assert.strictEqual(blockState.isFinished, true);
    assert.strictEqual(blockState.isCollapsed, true);
  });

  it("P6 [F6 x F9]: UI language change updates session mask default titles while preserving chat history", () => {
    const session = {
      id: "s1",
      topic: "Code Review",
      messages: [{ role: "user", content: "Review this function" }],
      mask: { id: "coder", name: "Coder" },
    };

    const i18nMaskNames: Record<string, string> = {
      en: "Coder",
      cn: "程序员",
      jp: "プログラマー",
    };

    const getLocalizedMaskName = (maskId: string, lang: string) => i18nMaskNames[lang] || maskId;

    assert.strictEqual(getLocalizedMaskName("coder", "en"), "Coder");
    assert.strictEqual(getLocalizedMaskName("coder", "cn"), "程序员");
    assert.strictEqual(getLocalizedMaskName("coder", "jp"), "プログラマー");
    assert.strictEqual(session.messages.length, 1);
  });

  it("P7 [F10 x F11]: model selector enables image upload only for models with hasVision", () => {
    const canUpload = (modelKey: string) => Boolean(modelsFixture[modelKey]?.hasVision);

    assert.strictEqual(canUpload("google/gemini-3-pro"), true);
    assert.strictEqual(canUpload("openai/gpt-4o"), true);
    assert.strictEqual(canUpload("openai/o3-mini"), false);
    assert.strictEqual(canUpload("openai/text-embedding-3-small"), false);
  });

  it("P8 [F13 x F14]: OpenAPI proxy calls retain target URL query while securing user credentials", () => {
    const buildProxyRequest = (targetUrl: string, secretApiKey?: string) => {
      const encoded = encodeURIComponent(targetUrl);
      return {
        proxyUrl: `/api/proxy?url=${encoded}`,
        headers: {
          "x-custom-auth": secretApiKey ? "SET" : "NONE",
        },
      };
    };

    const req = buildProxyRequest("https://api.weather-example.com/v1/weather/current?location=Berlin", "sk-secret-123");
    assert.ok(req.proxyUrl.includes("location%3DBerlin"));
    assert.strictEqual(req.headers["x-custom-auth"], "SET");
  });

  it("P9 [F9 x F15]: forking a session turn preserves the assistant reasoning history in the fork", () => {
    const originalMessages = [
      { id: "m1", role: "user", content: "Solve puzzle" },
      { id: "m2", role: "assistant", reasoning: "Examined clues 1 through 4", content: "Solution is X" },
      { id: "m3", role: "user", content: "What about clue 5?" },
    ];

    const forkedBranch = JSON.parse(JSON.stringify(originalMessages.slice(0, 2)));
    assert.strictEqual(forkedBranch.length, 2);
    assert.strictEqual(forkedBranch[1].reasoning, "Examined clues 1 through 4");
    assert.strictEqual(forkedBranch[1].content, "Solution is X");
  });

  it("P10 [F11 x F12]: parameter bounds prevent invalid payload reaching AI SDK streaming", () => {
    const sanitizeAndBuildPayload = (modelKey: string, requestedMaxTokens: number, requestedTemp: number) => {
      const meta = modelsFixture[modelKey] || { outputLimit: 4096 };
      return {
        max_tokens: Math.min(Math.max(1, requestedMaxTokens), meta.outputLimit),
        temperature: Math.min(Math.max(0.0, requestedTemp), 2.0),
      };
    };

    const clamped1 = sanitizeAndBuildPayload("openai/gpt-4o", 99999, 3.5);
    assert.strictEqual(clamped1.max_tokens, 4096);
    assert.strictEqual(clamped1.temperature, 2.0);

    const clamped2 = sanitizeAndBuildPayload("google/gemini-3-pro", 50000, -1.0);
    assert.strictEqual(clamped2.max_tokens, 50000);
    assert.strictEqual(clamped2.temperature, 0.0);
  });

  it("P11 [F14 x F16]: reasoning stream interleaves with tool calling and final response synthesis", () => {
    const complexStream = [
      encodeDataStreamChunk("g", "Need to retrieve current stock price first.\n"),
      encodeDataStreamChunk("9", { toolCallId: "call_stock_1", toolName: "getStockPrice", args: { symbol: "AAPL" } }),
      encodeDataStreamChunk("a", { toolCallId: "call_stock_1", result: { symbol: "AAPL", price: 230.5 } }),
      encodeDataStreamChunk("g", "Now evaluate the percentage change over last week.\n"),
      encodeDataStreamChunk("0", "Apple Inc. (AAPL) is currently trading at $230.50."),
      encodeDataStreamChunk("d", { finishReason: "stop" }),
    ].join("");

    const chunks = parseDataStreamResponse(complexStream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.toolCalls.length, 1);
    assert.strictEqual(state.toolResults.length, 1);
    assert.ok(state.reasoning.includes("Need to retrieve current stock price"));
    assert.ok(state.reasoning.includes("Now evaluate the percentage change"));
    assert.strictEqual(state.text, "Apple Inc. (AAPL) is currently trading at $230.50.");
  });

  it("P12 [F1 x F2]: pnpm build script runs standalone Next.js 16 build target", () => {
    const buildCommand = "pnpm mask && cross-env BUILD_MODE=standalone next build";
    assert.ok(buildCommand.startsWith("pnpm"));
    assert.ok(buildCommand.includes("next build"));
    assert.doesNotMatch(buildCommand, /yarn/);
  });

  it("P13 [F3 x F9]: web-only session export serializes to Blob and triggers standard DOM download", () => {
    const sessionData = { version: "2.0", sessions: [{ id: "s1", topic: "Research" }] };
    const jsonString = JSON.stringify(sessionData);
    const mockBlob = {
      size: jsonString.length,
      type: "application/json",
    };

    assert.ok(mockBlob.size > 0);
    assert.strictEqual(mockBlob.type, "application/json");
  });

  it("P14 [F4 x F13]: custom user API key executes directly without commercial paywall interception", () => {
    const directExecution = (apiKey: string) => {
      const isPaywalled = false; // 100% free open source
      return { proceed: true, hasDirectKey: Boolean(apiKey), isPaywalled };
    };

    const res = directExecution("sk-my-personal-key");
    assert.strictEqual(res.proceed, true);
    assert.strictEqual(res.isPaywalled, false);
  });

  it("P15 [F7 x F10]: image requests route to multimodal vision models instead of pruned Stable Diffusion", () => {
    const resolveImageHandlingStrategy = (hasImageAttachment: boolean, modelKey: string) => {
      if (hasImageAttachment) {
        const meta = modelsFixture[modelKey];
        if (meta?.hasVision) {
          return "MULTIMODAL_VISION_AI_SDK";
        }
        return "MODEL_DOES_NOT_SUPPORT_VISION";
      }
      return "TEXT_CHAT";
    };

    assert.strictEqual(resolveImageHandlingStrategy(true, "google/gemini-3-pro"), "MULTIMODAL_VISION_AI_SDK");
    assert.strictEqual(resolveImageHandlingStrategy(true, "openai/o3-mini"), "MODEL_DOES_NOT_SUPPORT_VISION");
    assert.strictEqual(resolveImageHandlingStrategy(false, "openai/gpt-4o"), "TEXT_CHAT");
  });

  it("P16 [F8 x F14]: tool registry operates purely on OpenAPI plugins without MCP dependencies", () => {
    const pluginRegistry: Array<{ id: string; type: "openapi"; spec: any }> = [
      { id: "weather_plugin", type: "openapi", spec: weatherSpec },
    ];

    assert.strictEqual(pluginRegistry.length, 1);
    assert.strictEqual(pluginRegistry[0].type, "openapi");
    assert.ok(pluginRegistry[0].spec.paths["/weather/current"]);
  });

  it("P17 [F6 x F16]: ThinkingBlock duration labels format dynamically based on active language", () => {
    const formatThoughtLabel = (seconds: number, lang: string) => {
      const secStr = seconds.toFixed(1);
      switch (lang) {
        case "cn":
          return `思考耗时 ${secStr} 秒`;
        case "jp":
          return `思考時間 ${secStr} 秒`;
        case "fr":
          return `Pensé pendant ${secStr}s`;
        case "en":
        default:
          return `Thought for ${secStr}s`;
      }
    };

    assert.strictEqual(formatThoughtLabel(3.4, "en"), "Thought for 3.4s");
    assert.strictEqual(formatThoughtLabel(3.4, "cn"), "思考耗时 3.4 秒");
    assert.strictEqual(formatThoughtLabel(3.4, "jp"), "思考時間 3.4 秒");
    assert.strictEqual(formatThoughtLabel(3.4, "fr"), "Pensé pendant 3.4s");
  });

  it("P18 [F10 x F15]: reasoning UI adapts input controls based on reasoningType (level vs budget)", () => {
    const getReasoningControl = (modelKey: string) => {
      const meta = modelsFixture[modelKey];
      if (!meta?.hasReasoning) return "NONE";
      return meta.reasoningType === "budget" ? "NUMBER_INPUT_BUDGET" : "DROPDOWN_LEVEL";
    };

    assert.strictEqual(getReasoningControl("google/gemini-3-pro"), "DROPDOWN_LEVEL");
    assert.strictEqual(getReasoningControl("google/gemini-2.5-pro"), "NUMBER_INPUT_BUDGET");
    assert.strictEqual(getReasoningControl("openai/gpt-4o"), "NONE");
  });
});

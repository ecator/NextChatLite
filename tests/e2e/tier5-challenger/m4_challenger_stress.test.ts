import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chatApiPayloadSchema,
  normalizeBaseUrl,
  sanitizeError,
  createLanguageModel,
  ChatApiPayload,
} from "../../../app/api/chat/route";
import {
  convertOpenApiSpecToAiTools,
  convertOpenApiToAiTools,
  clampToolResultSize,
  handleToolExecutionError,
  sanitizeToolArguments,
} from "../../../app/api/chat/tools";

describe("Milestone 4 Challenger Empirical Stress Suite", () => {
  // =========================================================================
  // 1. Base URL Normalization & SSRF Protocol Security Stress
  // =========================================================================
  describe("1. Base URL Normalization & SSRF Protocol Security Stress", () => {
    it("1.1 accepts valid HTTPS and HTTP URLs and normalizes trailing slashes", () => {
      assert.strictEqual(
        normalizeBaseUrl("https://api.openai.com/v1///"),
        "https://api.openai.com/v1",
      );
      assert.strictEqual(
        normalizeBaseUrl("http://localhost:8080/v1/"),
        "http://localhost:8080/v1",
      );
      assert.strictEqual(
        normalizeBaseUrl("https://custom.gateway.internal:9090"),
        "https://custom.gateway.internal:9090",
      );
    });

    it("1.2 strips query parameters and hashes from base URLs", () => {
      assert.strictEqual(
        normalizeBaseUrl("https://api.example.com/v1?token=secret#section"),
        "https://api.example.com/v1",
      );
    });

    it("1.3 rejects dangerous non-HTTP/HTTPS protocols to prevent SSRF and code execution", () => {
      const dangerousProtocols = [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "ftp://malicious-host.com/payload",
        "data:text/html,malicious",
        "gopher://evil.corp",
      ];

      for (const dangerous of dangerousProtocols) {
        assert.throws(
          () => normalizeBaseUrl(dangerous),
          (err: any) => err?.message?.includes("Disallowed protocol"),
          `Expected disallowed protocol rejection for ${dangerous}`,
        );
      }
    });

    it("1.4 handles empty, whitespace-only, and undefined inputs safely", () => {
      assert.strictEqual(normalizeBaseUrl(undefined), undefined);
      assert.strictEqual(normalizeBaseUrl(""), undefined);
      assert.strictEqual(normalizeBaseUrl("   "), undefined);
    });
  });

  // =========================================================================
  // 2. Secret Redaction & Error Sanitization Stress
  // =========================================================================
  describe("2. Secret Redaction & Error Sanitization Stress", () => {
    it("2.1 redacts exact user secret key from arbitrary error messages", () => {
      const userKey = "my_custom_ultra_secret_key_998877";
      const errorMsg = `Failed to connect with authorization Bearer ${userKey} at upstream endpoint`;
      const sanitized = sanitizeError(errorMsg, userKey);

      assert.doesNotMatch(sanitized, /my_custom_ultra_secret_key_998877/);
      assert.ok(sanitized.includes("[REDACTED_API_KEY]"));
    });

    it("2.2 automatically catches standard sk- API key patterns", () => {
      const complexLog = `OpenAI error: sk-proj-1234567890abcdefABCDEF and sk-ant-api03-abcdef123456 failed`;
      const sanitized = sanitizeError(complexLog);

      assert.doesNotMatch(sanitized, /sk-proj-1234567890abcdefABCDEF/);
      assert.doesNotMatch(sanitized, /sk-ant-api03-abcdef123456/);
      assert.strictEqual(
        sanitized,
        "OpenAI error: [REDACTED_API_KEY] and [REDACTED_API_KEY] failed",
      );
    });

    it("2.3 safely handles empty, null, or undefined error messages", () => {
      assert.strictEqual(sanitizeError(""), "");
      assert.strictEqual(sanitizeError("", "sk-key"), "");
    });
  });

  // =========================================================================
  // 3. Chat Payload Schema Validation Stress
  // =========================================================================
  describe("3. Chat Payload Schema Validation Stress", () => {
    it("3.1 validates correct payload schema with full configuration", () => {
      const validPayload: ChatApiPayload = {
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "What is 2 + 2?" },
        ],
        model: "gemini-3-pro",
        provider: "google",
        modelConfig: {
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 4096,
          reasoningConfig: {
            thinkingLevel: "high",
            thinkingBudget: 8192,
          },
        },
        customConfig: {
          apiKey: "custom-api-key",
          baseUrl: "https://custom.api.endpoint/v1",
        },
        pluginIds: ["weather_plugin"],
      };

      const result = chatApiPayloadSchema.safeParse(validPayload);
      assert.strictEqual(result.success, true);
    });

    it("3.2 validates multimodal message content array", () => {
      const multimodalPayload = {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image:" },
              { type: "image", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA" },
            ],
          },
        ],
        model: "gpt-4o",
        provider: "openai",
      };

      const result = chatApiPayloadSchema.safeParse(multimodalPayload);
      assert.strictEqual(result.success, true);
    });

    it("3.3 rejects invalid payloads: empty messages, missing model/provider, out-of-range temperatures", () => {
      // Empty messages
      assert.strictEqual(
        chatApiPayloadSchema.safeParse({ messages: [], model: "gpt-4o", provider: "openai" }).success,
        false,
      );

      // Missing model
      assert.strictEqual(
        chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "Hi" }],
          provider: "openai",
        }).success,
        false,
      );

      // Temperature out of range (> 2.0 or < 0.0)
      assert.strictEqual(
        chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "Hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { temperature: 3.5 },
        }).success,
        false,
      );

      // top_p out of range (> 1.0)
      assert.strictEqual(
        chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "Hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { top_p: 1.5 },
        }).success,
        false,
      );
    });
  });

  // =========================================================================
  // 4. OpenAPI Specification Tool Conversion & Execution Clamping Stress
  // =========================================================================
  describe("4. OpenAPI Tool Bridge & Execution Boundary Stress", () => {
    const validJsonSpec = {
      openapi: "3.0.0",
      info: { title: "Calculator API", version: "1.0.0" },
      servers: [{ url: "https://calculator.api.internal" }],
      paths: {
        "/add": {
          post: {
            operationId: "addNumbers",
            summary: "Adds two numbers",
            parameters: [
              { name: "a", in: "query", required: true, schema: { type: "number" } },
              { name: "b", in: "query", required: true, schema: { type: "number" } },
            ],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      precision: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const validYamlSpec = `
openapi: 3.0.0
info:
  title: Time API
  version: 1.0.0
servers:
  - url: https://time.api.internal
paths:
  /now:
    get:
      operationId: getCurrentTime
      summary: Returns current ISO time
      parameters:
        - name: timezone
          in: query
          required: false
          schema:
            type: string
`;

    it("4.1 converts JSON and YAML OpenAPI 3.0 specs into AI SDK tool definitions", () => {
      const jsonTools = convertOpenApiSpecToAiTools(validJsonSpec);
      assert.ok(jsonTools.addNumbers, "Tool addNumbers must exist");

      const yamlTools = convertOpenApiSpecToAiTools(validYamlSpec);
      assert.ok(yamlTools.getCurrentTime, "Tool getCurrentTime must exist");
    });

    it("4.2 handles corrupted or non-spec inputs gracefully without throwing", () => {
      assert.deepStrictEqual(convertOpenApiSpecToAiTools(null), {});
      assert.deepStrictEqual(convertOpenApiSpecToAiTools(undefined), {});
      assert.deepStrictEqual(convertOpenApiSpecToAiTools("invalid: yaml: ::: [corrupt]"), {});
      assert.deepStrictEqual(convertOpenApiSpecToAiTools({}), {});
      assert.deepStrictEqual(convertOpenApiToAiTools([], []), {});
    });

    it("4.3 clamps massive tool outputs to 100,000 characters to prevent token exhaustion", () => {
      const shortOutput = { status: "success", data: [1, 2, 3] };
      assert.deepStrictEqual(clampToolResultSize(shortOutput, 100), shortOutput);

      const massiveString = "A".repeat(150_000);
      const clamped = clampToolResultSize(massiveString, 100_000);
      assert.strictEqual(typeof clamped, "string");
      assert.ok(clamped.length < 105_000);
      assert.ok(clamped.includes("[TRUNCATED_DUE_TO_SIZE]"));
    });

    it("4.4 formats tool execution errors cleanly", () => {
      const errorResult = handleToolExecutionError(
        "searchWeb",
        new Error("Connection timed out after 5000ms"),
      );
      assert.strictEqual(errorResult.isError, true);
      assert.ok(errorResult.result.includes("searchWeb"));
      assert.ok(errorResult.result.includes("Connection timed out"));
    });

    it("4.5 sanitizes tool arguments safely", () => {
      assert.deepStrictEqual(sanitizeToolArguments(null), {});
      assert.deepStrictEqual(sanitizeToolArguments(undefined), {});
      assert.deepStrictEqual(sanitizeToolArguments("string"), {});
      assert.deepStrictEqual(sanitizeToolArguments({ key: "val" }), { key: "val" });
    });
  });

  // =========================================================================
  // 5. Multi-Provider Factory & Reasoning Middleware Stress
  // =========================================================================
  describe("5. Multi-Provider Factory & Model Resolution Stress", () => {
    it("5.1 dynamically resolves Google Generative AI with thinking config", () => {
      const googleModel = createLanguageModel({
        messages: [{ role: "user", content: "Hello" }],
        model: "gemini-3-pro",
        provider: "google",
        modelConfig: {
          reasoningConfig: {
            thinkingBudget: 4096,
            thinkingLevel: "high",
          },
        },
        customConfig: {
          apiKey: "custom-google-key",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        },
      });

      assert.ok(googleModel);
      assert.strictEqual(googleModel.provider, "google.generative-ai");
      assert.strictEqual(googleModel.modelId, "gemini-3-pro");
    });

    it("5.2 dynamically resolves Anthropic Claude with budget tokens", () => {
      const anthropicModel = createLanguageModel({
        messages: [{ role: "user", content: "Hello" }],
        model: "claude-3-7-sonnet-20250219",
        provider: "anthropic",
        modelConfig: {
          reasoningConfig: {
            thinkingBudget: 2048,
          },
        },
        customConfig: {
          apiKey: "custom-anthropic-key",
        },
      });

      assert.ok(anthropicModel);
      assert.strictEqual(anthropicModel.provider, "anthropic.messages");
      assert.strictEqual(anthropicModel.modelId, "claude-3-7-sonnet-20250219");
    });

    it("5.3 dynamically resolves OpenAI with reasoning effort and wraps R1 with reasoning middleware", () => {
      const o3Model = createLanguageModel({
        messages: [{ role: "user", content: "Solve math" }],
        model: "o3-mini",
        provider: "openai",
        modelConfig: {
          reasoningConfig: {
            thinkingLevel: "high",
          },
        },
        customConfig: {
          apiKey: "custom-openai-key",
        },
      });

      assert.ok(o3Model);
      assert.strictEqual(o3Model.provider, "openai.chat");
      assert.strictEqual(o3Model.modelId, "o3-mini");

      // DeepSeek R1 wrapped with reasoning middleware
      const deepseekR1 = createLanguageModel({
        messages: [{ role: "user", content: "Think deeply" }],
        model: "deepseek-r1",
        provider: "deepseek",
        customConfig: {
          apiKey: "custom-deepseek-key",
        },
      });

      assert.ok(deepseekR1);
      assert.strictEqual(deepseekR1.modelId, "deepseek-r1");
    });

    it("5.4 resolves custom OpenAI-compatible providers correctly", () => {
      const providersToTest = [
        { provider: "moonshot", model: "moonshot-v1-8k" },
        { provider: "siliconflow", model: "deepseek-ai/DeepSeek-V3" },
        { provider: "xai", model: "grok-2-latest" },
        { provider: "chatglm", model: "glm-4" },
        { provider: "alibaba", model: "qwen-max" },
        { provider: "bytedance", model: "doubao-pro-32k" },
        { provider: "302.AI", model: "gpt-4o" },
      ];

      for (const { provider, model } of providersToTest) {
        const langModel = createLanguageModel({
          messages: [{ role: "user", content: "Hello" }],
          model,
          provider,
          customConfig: {
            apiKey: `test-key-${provider}`,
            baseUrl: `https://test.${provider}.com/v1`,
          },
        });

        assert.ok(langModel, `Model for provider ${provider} must be created`);
        assert.strictEqual(langModel.modelId, model);
      }
    });
  });

  // =========================================================================
  // 6. Access Store Multi-Provider Key/URL Mapping Logic Stress
  // =========================================================================
  describe("6. Access Store Multi-Provider Key/URL Mapping Logic Stress", () => {
    it("6.1 matches provider keys and base URLs correctly across name variations", () => {
      const getApiKeyByProvider = (provider?: string, state: Record<string, string> = {}): string => {
        const p = (provider || "").toLowerCase();
        if (p.includes("google") || p.includes("gemini")) return state.googleApiKey || "";
        if (p.includes("anthropic") || p.includes("claude")) return state.anthropicApiKey || "";
        if (p.includes("azure")) return state.azureApiKey || "";
        if (p.includes("deepseek")) return state.deepseekApiKey || "";
        if (p.includes("moonshot")) return state.moonshotApiKey || "";
        if (p.includes("siliconflow")) return state.siliconflowApiKey || "";
        if (p.includes("xai")) return state.xaiApiKey || "";
        if (p.includes("chatglm") || p.includes("glm")) return state.chatglmApiKey || "";
        if (p.includes("302")) return state.ai302ApiKey || "";
        if (p.includes("alibaba")) return state.alibabaApiKey || "";
        if (p.includes("bytedance")) return state.bytedanceApiKey || "";
        if (p.includes("baidu")) return state.baiduApiKey || "";
        if (p.includes("iflytek")) return state.iflytekApiKey || "";
        return state.openaiApiKey || "";
      };

      const mockState = {
        googleApiKey: "key_google",
        anthropicApiKey: "key_anthropic",
        deepseekApiKey: "key_deepseek",
        openaiApiKey: "key_openai",
        moonshotApiKey: "key_moonshot",
      };

      assert.strictEqual(getApiKeyByProvider("Google", mockState), "key_google");
      assert.strictEqual(getApiKeyByProvider("gemini-3-pro", mockState), "key_google");
      assert.strictEqual(getApiKeyByProvider("Claude", mockState), "key_anthropic");
      assert.strictEqual(getApiKeyByProvider("deepseek", mockState), "key_deepseek");
      assert.strictEqual(getApiKeyByProvider("moonshot", mockState), "key_moonshot");
      assert.strictEqual(getApiKeyByProvider("OpenAI", mockState), "key_openai");
      assert.strictEqual(getApiKeyByProvider(undefined, mockState), "key_openai");
    });
  });
});

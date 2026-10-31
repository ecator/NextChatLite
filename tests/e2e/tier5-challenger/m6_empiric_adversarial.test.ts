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
import { readProjectFile } from "../fixtures/test_helpers";

describe("Milestone 6 Empirical Adversarial Stress & Hardening Test Suite", () => {
  // =========================================================================
  // 1. Adversarial Payloads & Schema Stress on /api/chat/route.ts
  // =========================================================================
  describe("1. Adversarial Payloads & Schema Stress", () => {
    it("1.1 rejects empty and non-array messages payloads", () => {
      // Empty array
      const res1 = chatApiPayloadSchema.safeParse({
        messages: [],
        model: "gpt-4o",
        provider: "openai",
      });
      assert.strictEqual(res1.success, false);
      if (!res1.success) {
        assert.ok(res1.error.errors.some((e) => e.message.includes("non-empty")));
      }

      // Non-array messages
      const invalidMessages = [
        "just a string",
        12345,
        null,
        undefined,
        { role: "user", content: "hello" },
        true,
      ];
      for (const m of invalidMessages) {
        const res = chatApiPayloadSchema.safeParse({
          messages: m,
          model: "gpt-4o",
          provider: "openai",
        });
        assert.strictEqual(res.success, false, `Expected failure for messages=${JSON.stringify(m)}`);
      }
    });

    it("1.2 rejects invalid message roles and malformed content structures", () => {
      const invalidRoles = ["admin", "moderator", "guest", "root", "", "bot"];
      for (const role of invalidRoles) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role, content: "hello" }],
          model: "gpt-4o",
          provider: "openai",
        });
        assert.strictEqual(res.success, false, `Expected rejection for role=${role}`);
      }

      // Invalid content types
      const invalidContents = [
        123,
        true,
        null,
        undefined,
        { text: "hello" },
        [{ type: "audio", audio: "http://..." }],
        [{ type: "video" }],
      ];
      for (const content of invalidContents) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content }],
          model: "gpt-4o",
          provider: "openai",
        });
        assert.strictEqual(res.success, false, `Expected rejection for content=${JSON.stringify(content)}`);
      }
    });

    it("1.3 rejects missing, empty, or non-string model and provider", () => {
      const invalidModels = ["", null, undefined, 123, true, {}, []];
      for (const model of invalidModels) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model,
          provider: "openai",
        });
        assert.strictEqual(res.success, false, `Expected rejection for model=${JSON.stringify(model)}`);
      }

      const invalidProviders = ["", null, undefined, 456, false, {}, []];
      for (const provider of invalidProviders) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider,
        });
        assert.strictEqual(res.success, false, `Expected rejection for provider=${JSON.stringify(provider)}`);
      }
    });

    it("1.4 rigorously validates boundary values for temperature [0, 2], top_p [0, 1], and max_tokens > 0", () => {
      // Temperature tests
      const badTemps = [-0.001, 2.001, -100, 100, NaN, "1.0"];
      for (const temperature of badTemps) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { temperature: temperature as any },
        });
        assert.strictEqual(res.success, false, `Expected rejection for temperature=${temperature}`);
      }

      const goodTemps = [0, 0.0, 0.5, 1.0, 1.99, 2.0];
      for (const temperature of goodTemps) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { temperature },
        });
        assert.strictEqual(res.success, true, `Expected acceptance for temperature=${temperature}`);
      }

      // top_p tests
      const badTopPs = [-0.001, 1.001, 2, -1, NaN];
      for (const top_p of badTopPs) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { top_p: top_p as any },
        });
        assert.strictEqual(res.success, false, `Expected rejection for top_p=${top_p}`);
      }

      const goodTopPs = [0, 0.0, 0.1, 0.9, 1.0];
      for (const top_p of goodTopPs) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { top_p },
        });
        assert.strictEqual(res.success, true, `Expected acceptance for top_p=${top_p}`);
      }

      // max_tokens tests
      const badTokens = [0, -1, -500, NaN];
      for (const max_tokens of badTokens) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { max_tokens: max_tokens as any },
        });
        assert.strictEqual(res.success, false, `Expected rejection for max_tokens=${max_tokens}`);
      }

      const goodTokens = [1, 512, 4096, 65536, 1000000];
      for (const max_tokens of goodTokens) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { max_tokens },
        });
        assert.strictEqual(res.success, true, `Expected acceptance for max_tokens=${max_tokens}`);
      }
    });

    it("1.5 validates reasoningConfig thinkingLevel enum and thinkingBudget positive number", () => {
      const validLevels = ["minimal", "low", "medium", "high"];
      for (const thinkingLevel of validLevels) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gemini-3-pro",
          provider: "google",
          modelConfig: {
            reasoningConfig: { thinkingLevel: thinkingLevel as any },
          },
        });
        assert.strictEqual(res.success, true, `Expected acceptance for thinkingLevel=${thinkingLevel}`);
      }

      const invalidLevels = ["none", "ultra", "extreme", "off", 1, true];
      for (const thinkingLevel of invalidLevels) {
        const res = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gemini-3-pro",
          provider: "google",
          modelConfig: {
            reasoningConfig: { thinkingLevel: thinkingLevel as any },
          },
        });
        assert.strictEqual(res.success, false, `Expected rejection for thinkingLevel=${thinkingLevel}`);
      }

      // thinkingBudget bounds
      assert.strictEqual(
        chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gemini-3-pro",
          provider: "google",
          modelConfig: {
            reasoningConfig: { thinkingBudget: 0 },
          },
        }).success,
        false,
      );

      assert.strictEqual(
        chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gemini-3-pro",
          provider: "google",
          modelConfig: {
            reasoningConfig: { thinkingBudget: 4096 },
          },
        }).success,
        true,
      );
    });
  });

  // =========================================================================
  // 2. Custom Base URL Injection & Secret Leakage Prevention
  // =========================================================================
  describe("2. Custom Base URL Injection & Secret Leakage Prevention", () => {
    it("2.1 blocks non-HTTP/HTTPS protocols and dangerous URL schemes", () => {
      const disallowed = [
        "javascript:alert(document.cookie)",
        "file:///C:/boot.ini",
        "file:///etc/shadow",
        "ftp://anonymous@ftp.upload.org/malware",
        "data:application/json;base64,eyJmb28iOiJiYXIifQ==",
        "blob:http://evil.com/4a5b-6c7d",
        "gopher://evil.com:70/1",
        "ldap://ad.internal:389/o=example",
        "view-source:http://localhost:3000",
      ];

      for (const url of disallowed) {
        assert.throws(
          () => normalizeBaseUrl(url),
          /Disallowed protocol/,
          `normalizeBaseUrl must reject disallowed protocol: ${url}`,
        );
      }
    });

    it("2.2 safely cleans valid HTTP/HTTPS URLs and strips query strings / fragments", () => {
      const cases: Array<[string, string]> = [
        ["https://api.openai.com/v1///", "https://api.openai.com/v1"],
        ["http://127.0.0.1:11434/v1/?token=secret#hash", "http://127.0.0.1:11434/v1"],
        ["https://custom.gateway.internal:8443/openai/v1", "https://custom.gateway.internal:8443/openai/v1"],
        ["http://[::1]:8000/v1/", "http://[::1]:8000/v1"],
      ];

      for (const [input, expected] of cases) {
        assert.strictEqual(normalizeBaseUrl(input), expected);
      }
    });

    it("2.3 guarantees complete redaction of custom API keys and standard sk- tokens from error messages", () => {
      const customSecret = "super-secret-custom-token-xyz-987654";
      const rawError = `Authentication failed: upstream returned 401 Unauthorized for Authorization: Bearer ${customSecret}`;
      const sanitized = sanitizeError(rawError, customSecret);

      assert.strictEqual(sanitized.includes(customSecret), false);
      assert.ok(sanitized.includes("[REDACTED_API_KEY]"));
      assert.strictEqual(
        sanitized,
        "Authentication failed: upstream returned 401 Unauthorized for Authorization: Bearer [REDACTED_API_KEY]",
      );
    });

    it("2.4 redacts multiple different sk- API key formats in a single error string", () => {
      const multiKeyError = `Errors: OpenAI key sk-proj-1234567890abcdefABCDEF failed, Claude key sk-ant-api03-abcdef123456789 failed, and DeepSeek key sk-deepseek-1234567890 failed.`;
      const sanitized = sanitizeError(multiKeyError);

      assert.ok(!sanitized.includes("sk-proj-1234567890abcdefABCDEF"));
      assert.ok(!sanitized.includes("sk-ant-api03-abcdef123456789"));
      assert.ok(!sanitized.includes("sk-deepseek-1234567890"));
      assert.strictEqual(
        sanitized,
        "Errors: OpenAI key [REDACTED_API_KEY] failed, Claude key [REDACTED_API_KEY] failed, and DeepSeek key [REDACTED_API_KEY] failed.",
      );
    });

    it("2.5 handles empty strings, undefined keys, and whitespace-only errors without exceptions", () => {
      assert.strictEqual(sanitizeError(""), "");
      assert.strictEqual(sanitizeError("", undefined), "");
      assert.strictEqual(sanitizeError("Regular error without keys"), "Regular error without keys");
      assert.strictEqual(sanitizeError("Regular error", "   "), "Regular error");
    });
  });

  // =========================================================================
  // 3. Multi-Step Tool Recursion Limits, Giant Payloads & Invalid Schemas
  // =========================================================================
  describe("3. Multi-Step Tool Limits, Giant Payloads & Schema Robustness", () => {
    it("3.1 verifies maxSteps: 5 is configured in /api/chat/route.ts to prevent runaway recursion", () => {
      const routeContent = readProjectFile("app/api/chat/route.ts");
      assert.ok(
        routeContent.includes("maxSteps: 5"),
        "route.ts must configure maxSteps: 5 for multi-step tool recursion limits",
      );
    });

    it("3.2 clamps giant tool payloads > 100,000 characters to prevent buffer overflow and token exhaustion", () => {
      const giantString = "B".repeat(250_000);
      const clamped = clampToolResultSize(giantString, 100_000);

      assert.ok(clamped.length <= 100_000 + 30);
      assert.ok(clamped.endsWith("\n...[TRUNCATED_DUE_TO_SIZE]"));
      assert.strictEqual(clamped.slice(0, 10), "BBBBBBBBBB");

      // Giant JSON object
      const giantObj = { payload: "C".repeat(150_000) };
      const clampedObj = clampToolResultSize(giantObj, 100_000);
      assert.ok(typeof clampedObj === "string");
      assert.ok(clampedObj.includes("[TRUNCATED_DUE_TO_SIZE]"));

      // Normal small payload is unchanged
      const smallData = { status: "ok", count: 42 };
      assert.deepStrictEqual(clampToolResultSize(smallData, 100_000), smallData);
    });

    it("3.3 converts invalid, empty, or corrupted OpenAPI schemas without throwing unhandled exceptions", () => {
      // Null / undefined / empty
      assert.deepStrictEqual(convertOpenApiSpecToAiTools(null), {});
      assert.deepStrictEqual(convertOpenApiSpecToAiTools(undefined), {});
      assert.deepStrictEqual(convertOpenApiSpecToAiTools(""), {});
      assert.deepStrictEqual(convertOpenApiSpecToAiTools("{}"), {});
      assert.deepStrictEqual(convertOpenApiSpecToAiTools("{ invalid json :: [ }"), {});
      assert.deepStrictEqual(convertOpenApiToAiTools(undefined, undefined), {});
      assert.deepStrictEqual(convertOpenApiToAiTools([], []), {});

      // Custom plugins array with empty or invalid content
      assert.deepStrictEqual(
        convertOpenApiToAiTools(undefined, [
          { content: "" },
          { content: "corrupted yaml: {{" },
          null as any,
        ]),
        {},
      );
    });

    it("3.4 converts complex OpenAPI 3.0 specs with path/query parameters, body schema, and auth headers", () => {
      const openApiSpec = {
        openapi: "3.0.0",
        info: { title: "Weather & Finance API", version: "2.0.0" },
        servers: [{ url: "https://api.external-service.org" }],
        paths: {
          "/weather/{city}": {
            get: {
              operationId: "getCityWeather",
              summary: "Fetch live city weather",
              parameters: [
                { name: "city", in: "path", required: true, schema: { type: "string" } },
                { name: "units", in: "query", schema: { type: "string", enum: ["metric", "imperial"] } },
              ],
            },
          },
          "/stock/quote": {
            post: {
              operationId: "getStockQuote",
              summary: "Fetch stock quote",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        symbol: { type: "string" },
                        period: { type: "string" },
                      },
                      required: ["symbol"],
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tools = convertOpenApiSpecToAiTools(openApiSpec, {
        authType: "bearer",
        authToken: "test-auth-token-12345",
      });

      assert.ok(tools.getCityWeather, "Tool getCityWeather must be generated");
      assert.ok(tools.getStockQuote, "Tool getStockQuote must be generated");
      assert.strictEqual(tools.getCityWeather.description, "Fetch live city weather");
      assert.strictEqual(tools.getStockQuote.description, "Fetch stock quote");
    });

    it("3.5 captures tool execution errors cleanly in handleToolExecutionError", () => {
      const err = handleToolExecutionError("databaseQuery", new Error("Connection refused on port 5432"));
      assert.strictEqual(err.isError, true);
      assert.strictEqual(
        err.result,
        "Tool 'databaseQuery' execution failed: Connection refused on port 5432",
      );

      // Non-Error exception
      const stringErr = handleToolExecutionError("customTool", "Fatal timeout string error");
      assert.strictEqual(stringErr.isError, true);
      assert.strictEqual(
        stringErr.result,
        "Tool 'customTool' execution failed: Fatal timeout string error",
      );
    });

    it("3.6 sanitizes raw tool arguments safely against invalid types", () => {
      assert.deepStrictEqual(sanitizeToolArguments(null), {});
      assert.deepStrictEqual(sanitizeToolArguments(undefined), {});
      assert.deepStrictEqual(sanitizeToolArguments("string-instead-of-object"), {});
      assert.deepStrictEqual(sanitizeToolArguments(12345), {});
      assert.deepStrictEqual(
        sanitizeToolArguments({ location: "Tokyo", count: 5 }),
        { location: "Tokyo", count: 5 },
      );
    });
  });

  // =========================================================================
  // 4. Multi-Provider Factory Dynamic Instantiation & Override Verification
  // =========================================================================
  describe("4. Multi-Provider Factory Dynamic Instantiation", () => {
    it("4.1 creates Google Generative AI model with Gemini 3 thinking config", () => {
      const model = createLanguageModel({
        messages: [{ role: "user", content: "Test" }],
        model: "gemini-3-pro",
        provider: "google",
        modelConfig: {
          reasoningConfig: {
            thinkingBudget: 8192,
            thinkingLevel: "high",
          },
        },
        customConfig: {
          apiKey: "custom-gemini-key",
          baseUrl: "https://custom.gemini.proxy/v1beta",
        },
      });

      assert.ok(model);
      assert.strictEqual(model.provider, "google.generative-ai");
      assert.strictEqual(model.modelId, "gemini-3-pro");
    });

    it("4.2 creates Anthropic Claude model with custom baseUrl and thinking budget", () => {
      const model = createLanguageModel({
        messages: [{ role: "user", content: "Test" }],
        model: "claude-3-7-sonnet",
        provider: "anthropic",
        modelConfig: {
          reasoningConfig: {
            thinkingBudget: 4096,
          },
        },
        customConfig: {
          apiKey: "custom-claude-key",
          baseUrl: "https://custom.anthropic.proxy/v1",
        },
      });

      assert.ok(model);
      assert.strictEqual(model.provider, "anthropic.messages");
      assert.strictEqual(model.modelId, "claude-3-7-sonnet");
    });

    it("4.3 creates OpenAI model with reasoning effort and wraps DeepSeek R1 with reasoning middleware", () => {
      const openaiModel = createLanguageModel({
        messages: [{ role: "user", content: "Test" }],
        model: "o3-mini",
        provider: "openai",
        modelConfig: {
          reasoningConfig: {
            thinkingLevel: "medium",
          },
        },
        customConfig: {
          apiKey: "custom-openai-key",
        },
      });

      assert.ok(openaiModel);
      assert.strictEqual(openaiModel.provider, "openai.chat");
      assert.strictEqual(openaiModel.modelId, "o3-mini");

      // DeepSeek R1 reasoning middleware wrapper
      const r1Model = createLanguageModel({
        messages: [{ role: "user", content: "Test" }],
        model: "deepseek-reasoner",
        provider: "deepseek",
        customConfig: {
          apiKey: "custom-deepseek-key",
        },
      });

      assert.ok(r1Model);
      assert.strictEqual(r1Model.modelId, "deepseek-reasoner");
    });

    it("4.4 creates custom third-party OpenAI-compatible providers", () => {
      const providers = [
        "moonshot",
        "siliconflow",
        "xai",
        "chatglm",
        "alibaba",
        "bytedance",
        "302",
      ];

      for (const provider of providers) {
        const model = createLanguageModel({
          messages: [{ role: "user", content: "Test" }],
          model: `test-model-${provider}`,
          provider,
          customConfig: {
            apiKey: `test-key-${provider}`,
            baseUrl: `https://${provider}.api.test/v1`,
          },
        });

        assert.ok(model, `Provider ${provider} must create a language model instance`);
        assert.strictEqual(model.modelId, `test-model-${provider}`);
      }
    });
  });
});

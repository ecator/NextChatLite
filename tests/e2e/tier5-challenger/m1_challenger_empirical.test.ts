import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createLanguageModel,
  normalizeBaseUrl,
  formatErrorMessage,
  chatApiPayloadSchema,
} from "../../../src/app/api/chat/route";
import { convertOpenApiToAiTools } from "../../../src/app/api/chat/tools";

describe("Milestone 1 Empirical Challenger Stress & Verification Suite", () => {
  // =========================================================================
  // Section 1: OpenAI vs OpenAI-Compatible Provider Verification
  // =========================================================================
  describe("1. OpenAI vs OpenAI-Compatible Provider Resolution", () => {
    it("1.1 resolves provider: 'openai' to @ai-sdk/openai chat model without compatibility mode", () => {
      const model = createLanguageModel({
        messages: [{ role: "user", content: "Hello" }],
        model: "gpt-4o",
        provider: "openai",
        customConfig: {
          apiKey: "sk-test-openai-native",
        },
      });

      assert.ok(model, "Model instance must be created");
      assert.strictEqual(model.provider, "openai.chat");
      assert.strictEqual(model.modelId, "gpt-4o");
      assert.strictEqual(model.specificationVersion, "v4");
      assert.strictEqual(model.constructor.name, "OpenAIChatLanguageModel");
    });

    it("1.2 resolves provider: 'openai' with custom baseUrl to @ai-sdk/openai native chat model (NOT compatibility mode)", () => {
      const model = createLanguageModel({
        messages: [{ role: "user", content: "Hello" }],
        model: "gpt-4o-mini",
        provider: "openai",
        customConfig: {
          apiKey: "sk-custom-proxy-key",
          baseUrl: "https://my-custom-proxy.internal/v1",
        },
      });

      assert.ok(model);
      assert.strictEqual(model.provider, "openai.chat");
      assert.strictEqual(model.modelId, "gpt-4o-mini");
      assert.strictEqual(model.specificationVersion, "v4");
      assert.strictEqual(model.constructor.name, "OpenAIChatLanguageModel");
    });

    it("1.3 resolves provider: 'openai-compatible' to @ai-sdk/openai-compatible chat model", () => {
      const model = createLanguageModel({
        messages: [{ role: "user", content: "Hello" }],
        model: "qwen-2.5-72b",
        provider: "openai-compatible",
        customConfig: {
          apiKey: "sk-compatible-key",
          baseUrl: "https://api.custom-ai-service.com/v1",
        },
      });

      assert.ok(model);
      assert.strictEqual(model.provider, "openai-compatible.chat");
      assert.strictEqual(model.modelId, "qwen-2.5-72b");
      assert.strictEqual(model.specificationVersion, "v4");
      assert.strictEqual(
        model.constructor.name,
        "OpenAICompatibleChatLanguageModel",
      );
    });

    it("1.4 resolves dynamic catalog spec (npm: '@ai-sdk/openai-compatible') to OpenAICompatibleChatLanguageModel", () => {
      const model = createLanguageModel({
        messages: [{ role: "user", content: "Hello" }],
        model: "gpt-5-mini",
        provider: "openai",
        npm: "@ai-sdk/openai-compatible",
        api: "http://127.0.0.1:11434/v1",
        customConfig: {
          apiKey: "sk-ollama-openai",
        },
      });

      assert.ok(model);
      assert.strictEqual(model.provider, "openai.chat");
      assert.strictEqual(model.modelId, "gpt-5-mini");
      assert.strictEqual(model.specificationVersion, "v4");
      assert.strictEqual(
        model.constructor.name,
        "OpenAICompatibleChatLanguageModel",
      );
    });

    it("1.5 resolves generic custom provider name to OpenAICompatibleChatLanguageModel", () => {
      const model = createLanguageModel({
        messages: [{ role: "user", content: "Hello" }],
        model: "custom-local-model",
        provider: "my-private-llm",
        customConfig: {
          apiKey: "sk-private",
          baseUrl: "http://10.0.0.50:8000/v1",
        },
      });

      assert.ok(model);
      assert.strictEqual(model.provider, "my-private-llm.chat");
      assert.strictEqual(model.modelId, "custom-local-model");
      assert.strictEqual(model.specificationVersion, "v4");
      assert.strictEqual(
        model.constructor.name,
        "OpenAICompatibleChatLanguageModel",
      );
    });

    it("1.6 normalizes custom base URLs with and without trailing slashes", () => {
      const testCases = [
        {
          input: "https://api.openai.com/v1",
          expected: "https://api.openai.com/v1",
        },
        {
          input: "https://api.openai.com/v1/",
          expected: "https://api.openai.com/v1",
        },
        {
          input: "https://api.openai.com/v1///",
          expected: "https://api.openai.com/v1",
        },
        {
          input: "http://localhost:11434/v1/",
          expected: "http://localhost:11434/v1",
        },
        {
          input: "http://127.0.0.1:8000/",
          expected: "http://127.0.0.1:8000",
        },
        {
          input: "https://custom.gateway.internal:8443/openai/v1/",
          expected: "https://custom.gateway.internal:8443/openai/v1",
        },
      ];

      for (const { input, expected } of testCases) {
        const normalized = normalizeBaseUrl(input);
        assert.strictEqual(
          normalized,
          expected,
          `normalizeBaseUrl failed for ${input}`,
        );

        // Verify with createLanguageModel for OpenAI-compatible
        const model = createLanguageModel({
          messages: [{ role: "user", content: "hi" }],
          model: "test-model",
          provider: "openai-compatible",
          customConfig: {
            baseUrl: input,
            apiKey: "sk-test",
          },
        });

        // The internal URL function should produce clean paths without double slashes
        const urlHelper = (model as any).config?.url;
        if (typeof urlHelper === "function") {
          const resolvedUrl = urlHelper({ path: "/chat/completions" });
          assert.strictEqual(
            resolvedUrl,
            `${expected}/chat/completions`,
            `Resolved URL mismatch for input ${input}`,
          );
        }
      }
    });
  });

  // =========================================================================
  // Section 2: Azure Provider Creation & Routing Verification
  // =========================================================================
  describe("2. Azure Provider Integration (@ai-sdk/azure)", () => {
    it("2.1 creates Azure provider with resourceName and deployment name as modelId", () => {
      const model = createLanguageModel({
        messages: [{ role: "user", content: "Hello" }],
        model: "gpt-4o-deployment",
        provider: "azure",
        providerOptions: {
          azureResourceName: "my-azure-ai-resource",
          azureApiVersion: "2024-06-01",
        },
        customConfig: {
          apiKey: "my-azure-secret-key-1",
        },
      });

      assert.ok(model);
      assert.strictEqual(model.provider, "azure.chat");
      assert.strictEqual(model.modelId, "gpt-4o-deployment");
      assert.strictEqual(model.specificationVersion, "v4");
      // @ai-sdk/azure uses OpenAIChatLanguageModel under the hood with provider = "azure.chat"
      assert.strictEqual(model.constructor.name, "OpenAIChatLanguageModel");

      // Verify resolved Azure endpoint format
      const urlHelper = (model as any).config?.url;
      if (typeof urlHelper === "function") {
        const url = urlHelper({
          modelId: "gpt-4o-deployment",
          path: "/chat/completions",
        });
        assert.ok(
          url.startsWith(
            "https://my-azure-ai-resource.openai.azure.com/openai/deployments/gpt-4o-deployment",
          ),
          `Unexpected Azure resource URL: ${url}`,
        );
        assert.ok(
          url.includes("api-version=2024-06-01"),
          `Missing api-version query param in Azure URL: ${url}`,
        );
      }
    });

    it("2.2 creates Azure provider with custom baseURL (API gateway override)", () => {
      const customGateway = "https://custom-apim.azure-api.net/openai/v1";
      const model = createLanguageModel({
        messages: [{ role: "user", content: "Hello" }],
        model: "gpt-35-turbo-dep",
        provider: "azure",
        customConfig: {
          apiKey: "my-gateway-azure-key",
          baseUrl: customGateway,
          apiVersion: "2024-02-15-preview",
        },
      });

      assert.ok(model);
      assert.strictEqual(model.provider, "azure.chat");
      assert.strictEqual(model.modelId, "gpt-35-turbo-dep");
      assert.strictEqual(model.specificationVersion, "v4");

      const urlHelper = (model as any).config?.url;
      if (typeof urlHelper === "function") {
        const url = urlHelper({
          modelId: "gpt-35-turbo-dep",
          path: "/chat/completions",
        });
        assert.ok(
          url.startsWith(
            "https://custom-apim.azure-api.net/openai/v1/deployments/gpt-35-turbo-dep",
          ),
          `Unexpected Azure baseURL URL: ${url}`,
        );
        assert.ok(url.includes("api-version=2024-02-15-preview"));
      }
    });

    it("2.3 respects apiVersion priority: providerOptions > customConfig > env > default", () => {
      // 1. From providerOptions.azureApiVersion
      const m1 = createLanguageModel({
        messages: [{ role: "user", content: "hi" }],
        model: "dep",
        provider: "azure",
        providerOptions: {
          azureResourceName: "res",
          azureApiVersion: "2024-10-01-preview",
        },
        customConfig: { apiVersion: "2024-01-01" },
      });
      const url1 = (m1 as any).config?.url?.({
        modelId: "dep",
        path: "/chat/completions",
      });
      assert.ok(url1?.includes("api-version=2024-10-01-preview"));

      // 2. From providerOptions.azure.apiVersion
      const m2 = createLanguageModel({
        messages: [{ role: "user", content: "hi" }],
        model: "dep",
        provider: "azure",
        providerOptions: {
          azureResourceName: "res",
          azure: { apiVersion: "2024-09-01-preview" },
        },
        customConfig: { apiVersion: "2024-01-01" },
      });
      const url2 = (m2 as any).config?.url?.({
        modelId: "dep",
        path: "/chat/completions",
      });
      assert.ok(url2?.includes("api-version=2024-09-01-preview"));

      // 3. From customConfig.apiVersion
      const m3 = createLanguageModel({
        messages: [{ role: "user", content: "hi" }],
        model: "dep",
        provider: "azure",
        providerOptions: { azureResourceName: "res" },
        customConfig: { apiVersion: "2024-07-01-preview" },
      });
      const url3 = (m3 as any).config?.url?.({
        modelId: "dep",
        path: "/chat/completions",
      });
      assert.ok(url3?.includes("api-version=2024-07-01-preview"));

      // 4. Default fallback ("2024-08-01-preview")
      const m4 = createLanguageModel({
        messages: [{ role: "user", content: "hi" }],
        model: "dep",
        provider: "azure",
        providerOptions: { azureResourceName: "res" },
      });
      const url4 = (m4 as any).config?.url?.({
        modelId: "dep",
        path: "/chat/completions",
      });
      assert.ok(url4?.includes("api-version=2024-08-01-preview"));
    });

    it("2.4 verifies Azure environment variable fallbacks in real-time resolution", () => {
      const originalEnv = { ...process.env };

      try {
        // AZURE_API_KEY
        process.env.AZURE_API_KEY = "env-azure-primary-key-123";
        delete process.env.AZURE_OPENAI_API_KEY;
        delete process.env.AZURE_RESOURCE_NAME;
        delete process.env.AZURE_URL;

        const mEnv1 = createLanguageModel({
          messages: [{ role: "user", content: "hi" }],
          model: "dep-env1",
          provider: "azure",
        });
        assert.ok(mEnv1);

        // AZURE_OPENAI_API_KEY alias
        delete process.env.AZURE_API_KEY;
        process.env.AZURE_OPENAI_API_KEY = "env-azure-secondary-key-456";
        const mEnv2 = createLanguageModel({
          messages: [{ role: "user", content: "hi" }],
          model: "dep-env2",
          provider: "azure",
        });
        assert.ok(mEnv2);

        // AZURE_RESOURCE_NAME fallback
        process.env.AZURE_RESOURCE_NAME = "env-resource-name";
        const mEnv3 = createLanguageModel({
          messages: [{ role: "user", content: "hi" }],
          model: "dep-env3",
          provider: "azure",
        });
        const url3 = (mEnv3 as any).config?.url?.({
          modelId: "dep-env3",
          path: "/chat/completions",
        });
        assert.ok(url3?.includes("https://env-resource-name.openai.azure.com"));

        // AZURE_URL env override
        process.env.AZURE_URL = "https://env-custom-gateway.openai.com/v1";
        const mEnv4 = createLanguageModel({
          messages: [{ role: "user", content: "hi" }],
          model: "dep-env4",
          provider: "azure",
        });
        const url4 = (mEnv4 as any).config?.url?.({
          modelId: "dep-env4",
          path: "/chat/completions",
        });
        assert.ok(
          url4?.includes(
            "https://env-custom-gateway.openai.com/v1/deployments",
          ),
        );
      } finally {
        process.env = originalEnv;
      }
    });
  });

  // =========================================================================
  // Section 3: Route Schema, Error Sanitization & Tool Calling Schema
  // =========================================================================
  describe("3. Schema & Tool Calling Adaptation", () => {
    it("3.1 verifies chatApiPayloadSchema accepts Azure credentials in providerOptions and customConfig", () => {
      const parsed = chatApiPayloadSchema.safeParse({
        messages: [{ role: "user", content: "Hello" }],
        model: "gpt-4o",
        provider: "azure",
        customConfig: {
          apiKey: "sk-azure-12345",
          baseUrl: "https://my-resource.openai.azure.com",
          apiVersion: "2024-08-01-preview",
        },
        providerOptions: {
          azureResourceName: "my-resource",
          azureApiKey: "sk-azure-12345",
          azureApiVersion: "2024-08-01-preview",
        },
      });

      assert.strictEqual(parsed.success, true);
    });

    it("3.2 formats and redacts secret keys in formatErrorMessage", () => {
      const secret = "secret-azure-key-abcdef987654";
      const err = new Error(
        `Failed request to Azure at https://my-res.openai.azure.com with key ${secret}`,
      );
      const sanitized = formatErrorMessage(err, secret);

      assert.ok(!sanitized.includes(secret));
      assert.ok(sanitized.includes("[REDACTED_API_KEY]"));
    });

    it("3.3 converts OpenAPI tools with inputSchema without type errors", () => {
      const spec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/calculate": {
            post: {
              operationId: "calculateSum",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        a: { type: "number" },
                        b: { type: "number" },
                      },
                      required: ["a", "b"],
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tools = convertOpenApiToAiTools(undefined, [
        { content: JSON.stringify(spec) },
      ]);
      assert.ok(tools.calculateSum, "calculateSum tool must exist");
      assert.ok(
        (tools.calculateSum as any).inputSchema,
        "inputSchema must be defined on tool",
      );
    });
  });

  // =========================================================================
  // Section 4: Route Handler POST Simulation & Edge Case Boundaries
  // =========================================================================
  describe("4. Route Handler POST Simulation & Edge Case Boundaries", () => {
    it("4.1 POST handler returns 400 Bad Request on invalid payloads", async () => {
      const { POST } = await import("../../../src/app/api/chat/route");
      const req = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [], // empty messages
          model: "gpt-4o",
          provider: "openai",
        }),
      });

      const res = await POST(req as any);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.error, true);
      assert.ok(Array.isArray(json.errors));
    });

    it("4.2 rejects dangerous non-HTTP/HTTPS protocols on custom baseUrl", () => {
      const dangerousUrls = [
        "file:///etc/passwd",
        "javascript:alert(1)",
        "gopher://evil.com/1",
        "ftp://example.com/v1",
      ];

      for (const dangerous of dangerousUrls) {
        assert.throws(
          () => normalizeBaseUrl(dangerous),
          /Disallowed protocol/,
          `Expected disallowed protocol error for ${dangerous}`,
        );
      }
    });

    it("4.3 handles Azure provider with both resourceName and baseURL (baseURL takes precedence)", () => {
      const model = createLanguageModel({
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-4o",
        provider: "azure",
        customConfig: {
          baseUrl: "https://my-proxy.company.internal/azure/v1",
          apiKey: "my-key",
        },
        providerOptions: {
          azureResourceName: "unused-resource",
        },
      });

      assert.ok(model);
      const urlHelper = (model as any).config?.url;
      if (typeof urlHelper === "function") {
        const url = urlHelper({
          modelId: "gpt-4o",
          path: "/chat/completions",
        });
        assert.ok(
          url.startsWith(
            "https://my-proxy.company.internal/azure/v1/deployments/gpt-4o",
          ),
          `Expected custom baseURL to take precedence: ${url}`,
        );
      }
    });
  });
});

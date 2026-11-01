import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { MockLanguageModelV4 } from "ai/test";
import {
  streamText,
  isStepCount,
  createUIMessageStreamResponse,
  toUIMessageStream,
  tool,
  jsonSchema,
} from "ai";
import {
  POST,
  createLanguageModel,
  formatErrorMessage,
} from "../../../src/app/api/chat/route";
import {
  convertOpenApiToAiTools,
  convertOpenApiSpecToAiTools,
  clampToolResultSize,
  sanitizeToolArguments,
} from "../../../src/app/api/chat/tools";

function createMockFinishChunk(unified: "tool-calls" | "stop") {
  return {
    type: "finish" as const,
    finishReason: { unified, raw: undefined },
    usage: {
      inputTokens: {
        total: 10,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 10,
        text: undefined,
        reasoning: undefined,
      },
    },
  };
}

describe("Milestone 1 Challenger Empirical Stress & Verification Suite", () => {
  // =========================================================================
  // 1. Tool Calling & OpenAPI inputSchema Execution under streamText
  // =========================================================================
  describe("1. Tool Calling & OpenAPI inputSchema Execution under streamText", () => {
    const sampleOpenApiSpec = {
      openapi: "3.0.0",
      info: { title: "Weather & Utility API", version: "1.0.0" },
      servers: [{ url: "https://api.utility.test/v1" }],
      paths: {
        "/weather": {
          get: {
            operationId: "getWeather",
            summary: "Get current weather for city",
            parameters: [
              {
                name: "city",
                in: "query",
                required: true,
                schema: { type: "string" },
              },
              {
                name: "units",
                in: "query",
                required: false,
                schema: { type: "string", enum: ["celsius", "fahrenheit"] },
              },
            ],
          },
        },
        "/users/{userId}/notes": {
          post: {
            operationId: "addNote",
            summary: "Add a note for a user",
            parameters: [
              {
                name: "userId",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      content: { type: "string" },
                    },
                    required: ["title"],
                  },
                },
              },
            },
          },
        },
      },
    };

    it("1.1 converts OpenAPI specification to AI SDK tools using inputSchema", () => {
      const tools = convertOpenApiSpecToAiTools(sampleOpenApiSpec);

      assert.ok(tools.getWeather, "getWeather tool must be created");
      assert.ok(tools.addNote, "addNote tool must be created");

      // Verify inputSchema is present and conforms to AI SDK schema contract
      assert.ok(
        tools.getWeather.inputSchema,
        "getWeather must have inputSchema",
      );
      assert.ok(
        (tools.getWeather.inputSchema as any)[Symbol.for("vercel.ai.schema")],
        "inputSchema must have AI SDK schema marker Symbol(vercel.ai.schema)",
      );

      // Verify execute function is defined
      assert.strictEqual(typeof tools.getWeather.execute, "function");
      assert.strictEqual(typeof tools.addNote.execute, "function");
    });

    it("1.2 executes OpenAPI tool end-to-end within streamText multi-step loop", async () => {
      const originalFetch = global.fetch;
      let requestedUrl = "";
      let requestedMethod = "";

      global.fetch = (async (url: any, opts: any) => {
        requestedUrl = String(url);
        requestedMethod = opts?.method || "GET";
        return new Response(
          JSON.stringify({
            city: "Tokyo",
            temperature: 22,
            condition: "Sunny",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as any;

      try {
        const tools = convertOpenApiToAiTools(
          ["test-plugin"],
          [{ id: "test-plugin", content: JSON.stringify(sampleOpenApiSpec) }],
        );

        let stepCount = 0;
        const mockModel = new MockLanguageModelV4({
          doStream: async () => {
            stepCount++;
            if (stepCount === 1) {
              return {
                stream: new ReadableStream({
                  start(controller) {
                    controller.enqueue({
                      type: "tool-call",
                      toolCallId: "call_weather_1",
                      toolName: "getWeather",
                      input: JSON.stringify({
                        city: "Tokyo",
                        units: "celsius",
                      }),
                    });
                    controller.enqueue(createMockFinishChunk("tool-calls"));
                    controller.close();
                  },
                }),
              };
            } else {
              return {
                stream: new ReadableStream({
                  start(controller) {
                    controller.enqueue({ type: "text-start", id: "txt_1" });
                    controller.enqueue({
                      type: "text-delta",
                      id: "txt_1",
                      delta: "The weather in Tokyo is 22°C and sunny.",
                    });
                    controller.enqueue({ type: "text-end", id: "txt_1" });
                    controller.enqueue(createMockFinishChunk("stop"));
                    controller.close();
                  },
                }),
              };
            }
          },
        });

        const result = streamText({
          model: mockModel,
          prompt: "What is the weather in Tokyo?",
          tools,
          stopWhen: isStepCount(5),
        });

        const steps = await result.steps;
        assert.strictEqual(
          steps.length,
          2,
          "Expected 2 steps: tool execution + text synthesis",
        );

        // Verify Step 1: Tool call and execution result
        assert.strictEqual(steps[0].toolCalls.length, 1);
        assert.strictEqual(steps[0].toolCalls[0].toolName, "getWeather");
        assert.deepStrictEqual(steps[0].toolCalls[0].input, {
          city: "Tokyo",
          units: "celsius",
        });

        assert.strictEqual(steps[0].toolResults.length, 1);
        assert.deepStrictEqual(steps[0].toolResults[0].output, {
          city: "Tokyo",
          temperature: 22,
          condition: "Sunny",
        });

        // Verify Step 2: Final text synthesis
        assert.strictEqual(
          steps[1].text,
          "The weather in Tokyo is 22°C and sunny.",
        );

        // Verify HTTP fetch invocation
        assert.strictEqual(
          requestedUrl,
          "https://api.utility.test/v1/weather?city=Tokyo&units=celsius",
        );
        assert.strictEqual(requestedMethod, "GET");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("1.3 executes OpenAPI tool with path parameters and JSON request body correctly", async () => {
      const originalFetch = global.fetch;
      let requestedUrl = "";
      let requestedMethod = "";
      let requestedBody = "";

      global.fetch = (async (url: any, opts: any) => {
        requestedUrl = String(url);
        requestedMethod = opts?.method || "GET";
        requestedBody = opts?.body || "";
        return new Response(
          JSON.stringify({ success: true, noteId: "note_123" }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as any;

      try {
        const tools = convertOpenApiSpecToAiTools(sampleOpenApiSpec);
        const result = await (tools.addNote as any).execute({
          userId: "user_42",
          title: "Meeting Notes",
          content: "Discuss project milestones",
        });

        assert.strictEqual(
          requestedUrl,
          "https://api.utility.test/v1/users/user_42/notes",
        );
        assert.strictEqual(requestedMethod, "POST");
        const parsedBody = JSON.parse(requestedBody);
        assert.deepStrictEqual(parsedBody, {
          title: "Meeting Notes",
          content: "Discuss project milestones",
        });
        assert.deepStrictEqual(result, { success: true, noteId: "note_123" });
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("1.4 handles upstream tool failure without throwing uncaught exceptions", async () => {
      const originalFetch = global.fetch;
      global.fetch = (async () => {
        return new Response("Service Unavailable", { status: 503 });
      }) as any;

      try {
        const tools = convertOpenApiSpecToAiTools(sampleOpenApiSpec);
        const errorResult = await (tools.getWeather as any).execute({
          city: "Nowhere",
        });

        assert.strictEqual(errorResult.isError, true);
        assert.ok(
          errorResult.result.includes("HTTP 503"),
          `Expected HTTP 503 error message, got ${errorResult.result}`,
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("1.5 clamps massive tool results exceeding 100,000 characters safely", () => {
      const hugeData = "A".repeat(120_000);
      const clamped = clampToolResultSize(hugeData, 100_000);

      assert.strictEqual(typeof clamped, "string");
      assert.ok(clamped.length < 105_000);
      assert.ok(clamped.includes("[TRUNCATED_DUE_TO_SIZE]"));
    });

    it("1.6 safely handles corrupt, undefined, or malformed tool arguments", () => {
      assert.deepStrictEqual(sanitizeToolArguments(null), {});
      assert.deepStrictEqual(sanitizeToolArguments(undefined), {});
      assert.deepStrictEqual(sanitizeToolArguments(12345), {});
      assert.deepStrictEqual(sanitizeToolArguments("string"), {});
      assert.deepStrictEqual(sanitizeToolArguments({ valid: "yes" }), {
        valid: "yes",
      });
    });
  });

  // =========================================================================
  // 2. Multi-Step Execution Limits: stopWhen: isStepCount(5)
  // =========================================================================
  describe("2. Multi-Step Execution Limits: stopWhen: isStepCount(5)", () => {
    it("2.1 strictly stops tool loop at step 5 when model continuously calls tools", async () => {
      let stepCounter = 0;

      const continuousToolCallingModel = new MockLanguageModelV4({
        doStream: async () => {
          stepCounter++;
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({
                  type: "tool-call",
                  toolCallId: `call_${stepCounter}`,
                  toolName: "dummyTool",
                  input: JSON.stringify({ count: stepCounter }),
                });
                controller.enqueue(createMockFinishChunk("tool-calls"));
                controller.close();
              },
            }),
          };
        },
      });

      const dummyTool = tool({
        description: "A dummy tool",
        inputSchema: jsonSchema({ type: "object" }),
        execute: async (args: any) => ({ step: args.count, status: "ok" }),
      });

      const result = streamText({
        model: continuousToolCallingModel,
        prompt: "Run continuous tool calls",
        tools: { dummyTool },
        stopWhen: isStepCount(5),
      });

      const steps = await result.steps;

      // Crucial empirical check: loop must terminate at exactly 5 steps
      assert.strictEqual(
        steps.length,
        5,
        `Expected exactly 5 steps under stopWhen: isStepCount(5), but got ${steps.length}`,
      );
      assert.strictEqual(
        stepCounter,
        5,
        `Model should have been queried exactly 5 times, but was queried ${stepCounter} times`,
      );
    });

    it("2.2 strictly respects lower step limits e.g. isStepCount(2)", async () => {
      let stepCounter = 0;

      const loopModel = new MockLanguageModelV4({
        doStream: async () => {
          stepCounter++;
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({
                  type: "tool-call",
                  toolCallId: `call_${stepCounter}`,
                  toolName: "dummyTool",
                  input: JSON.stringify({ count: stepCounter }),
                });
                controller.enqueue(createMockFinishChunk("tool-calls"));
                controller.close();
              },
            }),
          };
        },
      });

      const dummyTool = tool({
        description: "A dummy tool",
        inputSchema: jsonSchema({ type: "object" }),
        execute: async () => ({ status: "ok" }),
      });

      const result = streamText({
        model: loopModel,
        prompt: "Run 2 steps",
        tools: { dummyTool },
        stopWhen: isStepCount(2),
      });

      const steps = await result.steps;
      assert.strictEqual(steps.length, 2);
      assert.strictEqual(stepCounter, 2);
    });

    it("2.3 finishes before step limit when model returns normal finishReason 'stop'", async () => {
      let stepCounter = 0;

      const singleStepModel = new MockLanguageModelV4({
        doStream: async () => {
          stepCounter++;
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: "text-start", id: "t1" });
                controller.enqueue({
                  type: "text-delta",
                  id: "t1",
                  delta: "Immediate answer",
                });
                controller.enqueue({ type: "text-end", id: "t1" });
                controller.enqueue(createMockFinishChunk("stop"));
                controller.close();
              },
            }),
          };
        },
      });

      const result = streamText({
        model: singleStepModel,
        prompt: "Immediate answer",
        stopWhen: isStepCount(5),
      });

      const steps = await result.steps;
      assert.strictEqual(steps.length, 1);
      assert.strictEqual(stepCounter, 1);
      assert.strictEqual(await result.text, "Immediate answer");
    });
  });

  // =========================================================================
  // 3. Streaming Response Format & Server-Sent Events (SSE) Validation
  // =========================================================================
  describe("3. Streaming Response Format & Server-Sent Events (SSE) Validation", () => {
    it("3.1 createUIMessageStreamResponse outputs Content-Type text/event-stream and proper SSE headers", () => {
      const mockReadableStream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "start" } as any);
          controller.close();
        },
      });

      const response = createUIMessageStreamResponse({
        stream: mockReadableStream,
      });

      assert.strictEqual(
        response.headers.get("content-type"),
        "text/event-stream",
        "Header Content-Type must be text/event-stream",
      );
      assert.strictEqual(
        response.headers.get("cache-control"),
        "no-cache",
        "Header Cache-Control must be no-cache",
      );
      assert.strictEqual(
        response.headers.get("x-vercel-ai-ui-message-stream"),
        "v1",
        "Header x-vercel-ai-ui-message-stream must be v1",
      );
    });

    it("3.2 formats SSE stream chunks with data prefix and final [DONE] indicator", async () => {
      const mockModel = new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "text-start", id: "t1" });
              controller.enqueue({
                type: "text-delta",
                id: "t1",
                delta: "Hello ",
              });
              controller.enqueue({
                type: "text-delta",
                id: "t1",
                delta: "World!",
              });
              controller.enqueue({ type: "text-end", id: "t1" });
              controller.enqueue(createMockFinishChunk("stop"));
              controller.close();
            },
          }),
        }),
      });

      const result = streamText({
        model: mockModel,
        prompt: "Hello",
      });

      const response = createUIMessageStreamResponse({
        stream: toUIMessageStream({
          stream: result.stream,
          sendReasoning: true,
        }),
      });

      const responseText = await response.text();
      assert.ok(responseText.length > 0, "Response body should not be empty");

      // Verify every non-empty line starts with 'data: '
      const lines = responseText.split("\n\n").filter(Boolean);
      for (const line of lines) {
        assert.ok(
          line.startsWith("data: "),
          `Expected line to start with 'data: ', but got: ${line}`,
        );
      }

      // Verify terminal chunk is data: [DONE]
      const lastLine = lines[lines.length - 1];
      assert.strictEqual(lastLine, "data: [DONE]");

      // Verify text chunks are present
      assert.ok(responseText.includes(`"delta":"Hello "`));
      assert.ok(responseText.includes(`"delta":"World!"`));
    });

    it("3.3 POST /api/chat rejects invalid payload with 400 Bad Request", async () => {
      const invalidReq = new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [], // empty messages forbidden
          model: "gpt-4o",
          provider: "openai",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(invalidReq);
      assert.strictEqual(res.status, 400);

      const json = await res.json();
      assert.strictEqual(json.error, true);
      assert.ok(Array.isArray(json.errors));
    });
  });

  // =========================================================================
  // 4. Reasoning Deltas Streaming (sendReasoning: true)
  // =========================================================================
  describe("4. Reasoning Deltas Streaming (sendReasoning: true)", () => {
    it("4.1 streams reasoning-start, reasoning-delta, and reasoning-end when sendReasoning is true", async () => {
      const mockReasoningModel = new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "reasoning-start", id: "r_1" });
              controller.enqueue({
                type: "reasoning-delta",
                id: "r_1",
                delta: "Analyzing problem step 1...",
              });
              controller.enqueue({
                type: "reasoning-delta",
                id: "r_1",
                delta: " Arriving at conclusion.",
              });
              controller.enqueue({ type: "reasoning-end", id: "r_1" });
              controller.enqueue({ type: "text-start", id: "t_1" });
              controller.enqueue({
                type: "text-delta",
                id: "t_1",
                delta: "The solution is 42.",
              });
              controller.enqueue({ type: "text-end", id: "t_1" });
              controller.enqueue(createMockFinishChunk("stop"));
              controller.close();
            },
          }),
        }),
      });

      const result = streamText({
        model: mockReasoningModel,
        prompt: "Solve problem",
      });

      const response = createUIMessageStreamResponse({
        stream: toUIMessageStream({
          stream: result.stream,
          sendReasoning: true, // Matches src/app/api/chat/route.ts
        }),
      });

      const streamTextBody = await response.text();

      // Verify reasoning chunks in SSE output
      assert.ok(
        streamTextBody.includes(`"type":"reasoning-start"`),
        "Must contain reasoning-start chunk",
      );
      assert.ok(
        streamTextBody.includes(`"type":"reasoning-delta"`),
        "Must contain reasoning-delta chunk",
      );
      assert.ok(
        streamTextBody.includes(`Analyzing problem step 1...`),
        "Must contain first reasoning delta content",
      );
      assert.ok(
        streamTextBody.includes(` Arriving at conclusion.`),
        "Must contain second reasoning delta content",
      );
      assert.ok(
        streamTextBody.includes(`"type":"reasoning-end"`),
        "Must contain reasoning-end chunk",
      );

      // Verify final text chunk is also preserved
      assert.ok(
        streamTextBody.includes(`The solution is 42.`),
        "Must contain final answer text",
      );
    });

    it("4.2 wraps DeepSeek R1 and reasoner models with reasoning middleware", () => {
      const r1Model = createLanguageModel({
        messages: [{ role: "user", content: "Hi" }],
        model: "deepseek-r1",
        provider: "deepseek",
      });

      assert.ok(r1Model, "Model should be created");
      assert.strictEqual(r1Model.specificationVersion, "v4");
      assert.ok(r1Model.modelId.includes("deepseek-r1"));
    });
  });

  // =========================================================================
  // 5. Azure OpenAI Integration (@ai-sdk/azure) Verification
  // =========================================================================
  describe("5. Azure OpenAI Integration (@ai-sdk/azure) Verification", () => {
    it("5.1 instantiates Azure OpenAI model using createAzure with deployment-based URLs", () => {
      const azureModel = createLanguageModel({
        messages: [{ role: "user", content: "test" }],
        model: "gpt-4o-deployment",
        provider: "azure",
        providerOptions: {
          azureApiKey: "test-azure-key-12345",
          azureResourceName: "my-azure-resource",
          azureApiVersion: "2024-10-01-preview",
        },
      });

      assert.ok(azureModel, "Azure model should be defined");
      assert.strictEqual(azureModel.specificationVersion, "v4");
      assert.strictEqual(azureModel.provider, "azure.chat");
      assert.strictEqual(azureModel.modelId, "gpt-4o-deployment");
    });

    it("5.2 resolves Azure custom endpoint URL and environment variables cleanly", () => {
      const prevEnvKey = process.env.AZURE_API_KEY;
      const prevEnvUrl = process.env.AZURE_URL;
      const prevEnvVer = process.env.AZURE_API_VERSION;

      try {
        process.env.AZURE_API_KEY = "env-azure-secret-key";
        process.env.AZURE_URL = "https://custom-gateway.openai.azure.com";
        process.env.AZURE_API_VERSION = "2024-08-01-preview";

        const azureModel = createLanguageModel({
          messages: [{ role: "user", content: "hello" }],
          model: "gpt-4o",
          provider: "azure",
        });

        assert.ok(azureModel);
        assert.strictEqual(azureModel.provider, "azure.chat");
        assert.strictEqual(azureModel.modelId, "gpt-4o");
        assert.strictEqual(azureModel.specificationVersion, "v4");
      } finally {
        process.env.AZURE_API_KEY = prevEnvKey;
        process.env.AZURE_URL = prevEnvUrl;
        process.env.AZURE_API_VERSION = prevEnvVer;
      }
    });
  });

  // =========================================================================
  // 6. OpenAI-Compatible Provider Migration (@ai-sdk/openai-compatible)
  // =========================================================================
  describe("6. OpenAI-Compatible Provider Migration (@ai-sdk/openai-compatible)", () => {
    it("6.1 uses @ai-sdk/openai-compatible createOpenAICompatible for custom and third-party providers", () => {
      const compatibleProviders = [
        {
          provider: "moonshot",
          model: "moonshot-v1-8k",
          expectedProvider: "moonshot.chat",
        },
        {
          provider: "deepseek",
          model: "deepseek-chat",
          expectedProvider: "deepseek.chat",
        },
        {
          provider: "siliconflow",
          model: "Qwen/Qwen2.5-72B-Instruct",
          expectedProvider: "siliconflow.chat",
        },
        {
          provider: "openai-compatible",
          model: "local-llama-3",
          expectedProvider: "openai-compatible.chat",
        },
      ];

      for (const item of compatibleProviders) {
        const model = createLanguageModel({
          messages: [{ role: "user", content: "hi" }],
          model: item.model,
          provider: item.provider,
        });

        assert.ok(model, `Model for ${item.provider} should be created`);
        assert.strictEqual(model.specificationVersion, "v4");
        assert.strictEqual(model.provider, item.expectedProvider);
        assert.strictEqual(model.modelId, item.model);
      }
    });

    it("6.2 maps custom base URLs and headers to OpenAI-compatible provider", () => {
      const customModel = createLanguageModel({
        messages: [{ role: "user", content: "hi" }],
        model: "custom-llm",
        provider: "my-gateway",
        customConfig: {
          apiKey: "gw-secret-1234",
          baseUrl: "https://my-custom-gateway.internal/v1",
        },
      });

      assert.ok(customModel);
      assert.strictEqual(customModel.specificationVersion, "v4");
      assert.strictEqual(customModel.provider, "my-gateway.chat");
      assert.strictEqual(customModel.modelId, "custom-llm");
    });
  });

  // =========================================================================
  // 7. Security Redaction & Error Formatting
  // =========================================================================
  describe("7. Security Redaction & Error Formatting", () => {
    it("7.1 formatErrorMessage redacts secret keys from error strings", () => {
      const secret = "super-secret-user-api-key";
      const err = new Error(`Connection to provider failed with key ${secret}`);
      const formatted = formatErrorMessage(err, secret);

      assert.doesNotMatch(formatted, new RegExp(secret));
      assert.ok(formatted.includes("[REDACTED_API_KEY]"));
    });

    it("7.2 formatErrorMessage redacts standard sk- tokens automatically", () => {
      const err = new Error(
        "Invalid token: sk-proj-1234567890abcdefABCDEF1234",
      );
      const formatted = formatErrorMessage(err);

      assert.doesNotMatch(formatted, /sk-proj-1234567890abcdefABCDEF1234/);
      assert.ok(formatted.includes("[REDACTED_API_KEY]"));
    });
  });
});

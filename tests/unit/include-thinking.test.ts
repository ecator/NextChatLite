import { chatApiPayloadSchema, POST } from "@/app/api/chat/route";
import { useChatStore } from "@/store/chat";
import { useAppConfig } from "@/store/config";
import { processDataStream } from "@/utils/chat-stream";

describe("includeThinking feature and stream propagation", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useAppConfig.getState().reset();
    useChatStore.getState().clearSessions();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("chatApiPayloadSchema validation", () => {
    const basePayload = {
      messages: [{ role: "user" as const, content: "Hello" }],
      model: "gemini-2.5-pro",
      provider: "google",
    };

    test("accepts modelConfig.reasoningConfig.includeThinking boolean", () => {
      const parsedTrue = chatApiPayloadSchema.parse({
        ...basePayload,
        modelConfig: {
          reasoningConfig: {
            includeThinking: true,
            thinkingLevel: "high",
            thinkingBudget: 4096,
          },
        },
      });

      expect(parsedTrue.modelConfig?.reasoningConfig?.includeThinking).toBe(
        true,
      );
      expect(parsedTrue.modelConfig?.reasoningConfig?.thinkingLevel).toBe(
        "high",
      );
      expect(parsedTrue.modelConfig?.reasoningConfig?.thinkingBudget).toBe(
        4096,
      );

      const parsedFalse = chatApiPayloadSchema.parse({
        ...basePayload,
        modelConfig: {
          reasoningConfig: {
            includeThinking: false,
          },
        },
      });
      expect(parsedFalse.modelConfig?.reasoningConfig?.includeThinking).toBe(
        false,
      );
    });
  });

  describe("store configuration default and updates", () => {
    test("default config includes includeThinking = true", () => {
      const config = useAppConfig.getState();
      expect(config.modelConfig.includeThinking).toBe(true);
    });

    test("updating includeThinking reflects in modelConfig", () => {
      const configStore = useAppConfig.getState();
      configStore.update((cfg) => {
        cfg.modelConfig.includeThinking = false;
      });

      expect(useAppConfig.getState().modelConfig.includeThinking).toBe(false);
    });
  });

  describe("chatStore onUserInput payload transmission", () => {
    test("passes includeThinking to chat API payload in onUserInput", async () => {
      let capturedPayload: any = null;

      global.fetch = jest.fn().mockImplementation((url, init) => {
        capturedPayload = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"reasoning-delta","delta":"Thinking..."}\n\ndata: {"type":"text-delta","delta":"Hello!"}\n\ndata: [DONE]\n\n',
                ),
              );
              controller.close();
            },
          }),
        });
      });

      const chatStore = useChatStore.getState();
      const session = chatStore.currentSession();
      session.mask.modelConfig.includeThinking = true;
      useAppConfig.getState().update((cfg) => {
        cfg.modelConfig.includeThinking = true;
      });

      await chatStore.onUserInput("test question", []);
      // Allow the background stream consumption IIFE in onUserInput to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.includeThinking).toBeUndefined();
      expect(capturedPayload.modelConfig.includeThinking).toBeUndefined();
      expect(capturedPayload.modelConfig.reasoningConfig.includeThinking).toBe(
        true,
      );

      const updatedSession = chatStore.currentSession();
      const assistantMessage = updatedSession.messages.find(
        (m) => m.role === "assistant",
      );
      expect(assistantMessage).toBeDefined();
      expect(assistantMessage?.reasoning).toBe("Thinking...");
      expect(assistantMessage?.content).toBe("Hello!");
    });
  });

  describe("processDataStream reasoning delta variants", () => {
    test("extracts reasoning from reasoning-delta, thought, and reasoning_content", async () => {
      const streamChunks = [
        'data: {"type":"reasoning-delta","delta":"Chunk 1. "}\n\n',
        'data: {"type":"thought","delta":"Chunk 2. "}\n\n',
        'data: {"type":"reasoning_content","delta":"Chunk 3."}\n\n',
        'data: {"type":"text-delta","delta":"Answer text"}\n\n',
        "data: [DONE]\n\n",
      ];

      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of streamChunks) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        },
      });

      let accumulatedReasoning = "";
      let accumulatedText = "";

      await processDataStream({
        stream,
        onReasoningPart: (delta) => {
          accumulatedReasoning += delta;
        },
        onTextPart: (delta) => {
          accumulatedText += delta;
        },
      });

      expect(accumulatedReasoning).toBe("Chunk 1. Chunk 2. Chunk 3.");
      expect(accumulatedText).toBe("Answer text");
    });
  });

  describe("POST /api/chat end-to-end AI SDK provider option propagation", () => {
    const origHeaders = global.Headers;
    const origResponse = global.Response;
    const origTextEncoderStream = (global as any).TextEncoderStream;
    const origTextDecoderStream = (global as any).TextDecoderStream;

    beforeAll(() => {
      const streamWeb = require("node:stream/web");
      if (!origTextEncoderStream) {
        (global as any).TextEncoderStream = streamWeb.TextEncoderStream;
      }
      if (!origTextDecoderStream) {
        (global as any).TextDecoderStream = streamWeb.TextDecoderStream;
      }
      (global as any).Headers = class MockHeaders {
        private map = new Map<string, string>();
        constructor(
          init?: Record<string, string> | [string, string][] | MockHeaders,
        ) {
          if (init instanceof MockHeaders) {
            init.map.forEach((v, k) => this.map.set(k.toLowerCase(), v));
          } else if (Array.isArray(init)) {
            for (const [k, v] of init) this.map.set(k.toLowerCase(), String(v));
          } else if (init && typeof init === "object") {
            for (const [k, v] of Object.entries(init)) {
              if (v !== undefined) this.map.set(k.toLowerCase(), String(v));
            }
          }
        }
        get(name: string) {
          return this.map.get(name.toLowerCase()) ?? null;
        }
        set(name: string, value: string) {
          this.map.set(name.toLowerCase(), String(value));
        }
        has(name: string) {
          return this.map.has(name.toLowerCase());
        }
        append(name: string, value: string) {
          this.map.set(name.toLowerCase(), String(value));
        }
        delete(name: string) {
          this.map.delete(name.toLowerCase());
        }
        forEach(cb: (v: string, k: string) => void) {
          this.map.forEach((v, k) => cb(v, k));
        }
        entries() {
          return this.map.entries();
        }
        [Symbol.iterator]() {
          return this.map.entries();
        }
      };
      (global as any).Response = class MockResponse {
        body: any;
        status: number;
        ok: boolean;
        headers: any;
        constructor(body?: any, init?: any) {
          this.body = body;
          this.status = init?.status ?? 200;
          this.ok = this.status >= 200 && this.status < 300;
          this.headers = new (global as any).Headers(init?.headers);
        }
        static json(data: any, init?: any) {
          return new MockResponse(JSON.stringify(data), init);
        }
      };
    });

    afterAll(() => {
      global.Headers = origHeaders;
      global.Response = origResponse;
      (global as any).TextEncoderStream = origTextEncoderStream;
      (global as any).TextDecoderStream = origTextDecoderStream;
    });

    const createMockReq = (bodyObj: any) =>
      ({
        json: async () => bodyObj,
        signal: new AbortController().signal,
      }) as any;

    const consumeResponseStream = async (res: any) => {
      if (!res?.body) return "";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let output = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output +=
          typeof value === "string"
            ? value
            : decoder.decode(value, { stream: true });
      }
      return output;
    };

    const createSseFetchResponse = (ssePayload: string) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new (global as any).Headers({
        "content-type": "text/event-stream",
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(ssePayload));
          controller.close();
        },
      }),
      text: async () => ssePayload,
    });

    test("Google Gemini 3: sends generationConfig.thinkingConfig.includeThoughts and thinkingLevel to Google API and streams reasoning-delta", async () => {
      let outboundUrl = "";
      let outboundBody: any = null;

      global.fetch = jest.fn().mockImplementation(async (url, init) => {
        outboundUrl = String(url);
        outboundBody = init?.body ? JSON.parse(String(init.body)) : null;
        return createSseFetchResponse(
          'data: {"candidates":[{"content":{"parts":[{"text":"Thought process","thought":true},{"text":"Final answer"}]},"finishReason":"STOP"}]}\n\n',
        );
      });

      const req = createMockReq({
        messages: [{ role: "user", content: "Hello" }],
        model: "gemini-3.5-flash",
        provider: "google",
        npm: "@ai-sdk/google",
        customConfig: { apiKey: "test-google-key" },
        modelInfo: { reasoning: true },
        modelConfig: {
          reasoningConfig: {
            includeThinking: true,
            thinkingLevel: "high",
          },
        },
      });

      const res = await POST(req);
      const sseOutput = await consumeResponseStream(res);

      expect(outboundUrl).toContain("gemini-3.5-flash");
      expect(outboundBody).toBeDefined();
      expect(outboundBody.generationConfig?.thinkingConfig).toEqual({
        includeThoughts: true,
        thinkingLevel: "high",
      });
      expect(sseOutput).toContain('"type":"reasoning-delta"');
      expect(sseOutput).toContain("Thought process");
    });

    test("Ollama / OpenAI-Compatible (gemma4:12b): sends reasoning_effort in request body and streams reasoning-delta when includeThinking is true vs false", async () => {
      const outboundBodies: any[] = [];

      global.fetch = jest.fn().mockImplementation(async (_url, init) => {
        if (init?.body) {
          outboundBodies.push(JSON.parse(String(init.body)));
        }
        return createSseFetchResponse(
          'data: {"id":"1","choices":[{"index":0,"delta":{"reasoning":"step 1","content":"answer"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        );
      });

      // 1. Default includeThinking: true (without explicit thinkingLevel -> defaults to "medium")
      const reqTrue = createMockReq({
        messages: [{ role: "user", content: "Hello" }],
        model: "gemma4:12b",
        provider: "ollama",
        npm: "@ai-sdk/openai-compatible",
        api: "http://127.0.0.1:11434/v1",
        modelInfo: { reasoning: true },
        modelConfig: {
          reasoningConfig: {
            includeThinking: true,
          },
        },
      });
      const resTrue = await POST(reqTrue);
      const sseTrue = await consumeResponseStream(resTrue);

      // 2. includeThinking: false -> sends reasoning_effort: "none" and suppresses reasoning-delta
      const reqFalse = createMockReq({
        messages: [{ role: "user", content: "Hello" }],
        model: "gemma4:12b",
        provider: "ollama",
        npm: "@ai-sdk/openai-compatible",
        api: "http://127.0.0.1:11434/v1",
        modelInfo: { reasoning: true },
        modelConfig: {
          reasoningConfig: {
            includeThinking: false,
          },
        },
      });
      const resFalse = await POST(reqFalse);
      const sseFalse = await consumeResponseStream(resFalse);

      expect(outboundBodies.length).toBe(2);
      expect(outboundBodies[0].reasoning_effort).toBe("medium");
      expect(outboundBodies[0].include_thinking).toBeUndefined();
      expect(outboundBodies[0].includeThinking).toBeUndefined();
      expect(sseTrue).toContain('"type":"reasoning-delta"');
      expect(sseTrue).toContain("step 1");

      expect(outboundBodies[1].reasoning_effort).toBe("none");
      expect(sseFalse).not.toContain('"type":"reasoning-delta"');
    });

    test("OpenAI (gpt-5.1): does not overwrite providerOptions.openai and sends reasoning_effort", async () => {
      let outboundBody: any = null;

      global.fetch = jest.fn().mockImplementation(async (_url, init) => {
        if (init?.body) {
          outboundBody = JSON.parse(String(init.body));
        }
        return createSseFetchResponse(
          'data: {"id":"1","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        );
      });

      const req = createMockReq({
        messages: [{ role: "user", content: "Hello" }],
        model: "gpt-5.1",
        provider: "openai",
        npm: "@ai-sdk/openai",
        customConfig: { apiKey: "test-openai-key" },
        modelInfo: { reasoning: true },
        modelConfig: {
          reasoningConfig: {
            includeThinking: true,
            thinkingLevel: "high",
          },
        },
      });

      const res = await POST(req);
      await consumeResponseStream(res);

      expect(outboundBody).toBeDefined();
      expect(outboundBody.reasoning_effort).toBe("high");
    });
  });
});

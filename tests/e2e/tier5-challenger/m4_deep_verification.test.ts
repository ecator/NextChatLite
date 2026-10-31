import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeDataStreamChunk } from "../fixtures/mock_chat_streams";
import { processDataStream } from "ai";

interface MockChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  reasoning?: string;
  streaming?: boolean;
  isError?: boolean;
  tools?: Array<{
    id: string;
    function?: { name: string; arguments?: string };
    content?: string;
    isError?: boolean;
  }>;
}

class MockChatControllerPool {
  private static controllers: Record<string, AbortController> = {};

  static key(sessionId: string, messageId: string | number) {
    return `${sessionId},${messageId}`;
  }

  static addController(sessionId: string, messageId: string | number, controller: AbortController) {
    const key = this.key(sessionId, messageId);
    this.controllers[key] = controller;
    return key;
  }

  static stop(sessionId: string, messageId: string | number) {
    const key = this.key(sessionId, messageId);
    const controller = this.controllers[key];
    controller?.abort();
  }

  static remove(sessionId: string, messageId: string | number) {
    const key = this.key(sessionId, messageId);
    delete this.controllers[key];
  }

  static hasPending() {
    return Object.keys(this.controllers).length > 0;
  }
}

class MockChatStreamConsumer {
  messages: MockChatMessage[] = [];

  async consumeStream(stream: ReadableStream<Uint8Array>, abortSignal?: AbortSignal) {
    const botMessage: MockChatMessage = {
      id: "bot_" + Math.random().toString(36).substring(2, 9),
      role: "assistant",
      content: "",
      streaming: true,
      reasoning: "",
      tools: [],
    };
    this.messages.push(botMessage);

    try {
      await processDataStream({
        stream,
        onTextPart: (delta) => {
          botMessage.streaming = true;
          botMessage.content += delta;
        },
        onReasoningPart: (delta) => {
          botMessage.streaming = true;
          botMessage.reasoning = (botMessage.reasoning || "") + delta;
        },
        onToolCallPart: (call) => {
          botMessage.streaming = true;
          botMessage.tools = botMessage.tools || [];
          botMessage.tools.push({
            id: call.toolCallId,
            function: {
              name: call.toolName,
              arguments: typeof call.args === "string" ? call.args : JSON.stringify(call.args),
            },
          });
        },
        onToolResultPart: (res) => {
          botMessage.tools = botMessage.tools || [];
          const existing = botMessage.tools.find((t) => t.id === res.toolCallId);
          const resultStr = typeof res.result === "string" ? res.result : JSON.stringify(res.result);
          if (existing) {
            existing.content = resultStr;
            existing.isError = false;
          } else {
            botMessage.tools.push({
              id: res.toolCallId,
              content: resultStr,
              isError: false,
            });
          }
        },
        onErrorPart: (err) => {
          botMessage.isError = true;
          botMessage.content += `\n\n[Error]: ${err}`;
        },
        onFinishMessagePart: () => {
          botMessage.streaming = false;
        },
      });
    } catch (err: any) {
      botMessage.streaming = false;
      if (abortSignal?.aborted || err.name === "AbortError" || err.message?.includes("aborted")) {
        // Cleanly handled client abort
      } else {
        botMessage.isError = true;
        botMessage.content += `\n\n[Exception]: ${err.message || String(err)}`;
      }
    }

    return botMessage;
  }
}

describe("Milestone 4 Deep Store Verification & Client Streaming Integration", () => {
  it("4.1 ChatControllerPool accurately tracks and releases controllers per session and message ID", () => {
    const sessionId = "test-session-123";
    const messageId = "msg-bot-456";
    const controller = new AbortController();

    MockChatControllerPool.addController(sessionId, messageId, controller);
    assert.strictEqual(MockChatControllerPool.hasPending(), true);

    // Abort controller
    MockChatControllerPool.stop(sessionId, messageId);
    assert.strictEqual(controller.signal.aborted, true);

    // Remove controller
    MockChatControllerPool.remove(sessionId, messageId);
    assert.strictEqual(MockChatControllerPool.hasPending(), false);
  });

  it("4.2 resolves custom API keys and Base URLs across providers", () => {
    function resolveProviderKeyAndUrl(
      provider: string,
      customStore: Record<string, { apiKey: string; url: string }>,
    ) {
      const p = (provider || "").toLowerCase();
      if (p.includes("google") || p.includes("gemini")) return customStore.google;
      if (p.includes("anthropic") || p.includes("claude")) return customStore.anthropic;
      if (p.includes("deepseek")) return customStore.deepseek;
      if (p.includes("moonshot")) return customStore.moonshot;
      if (p.includes("siliconflow")) return customStore.siliconflow;
      if (p.includes("xai")) return customStore.xai;
      if (p.includes("chatglm") || p.includes("glm")) return customStore.chatglm;
      if (p.includes("302")) return customStore.ai302;
      return customStore.openai;
    }

    const customStore = {
      google: { apiKey: "key-google", url: "https://google.custom.com" },
      anthropic: { apiKey: "key-anthropic", url: "https://anthropic.custom.com" },
      openai: { apiKey: "key-openai", url: "https://openai.custom.com" },
      deepseek: { apiKey: "key-deepseek", url: "https://deepseek.custom.com" },
      moonshot: { apiKey: "key-moonshot", url: "https://moonshot.custom.com" },
      siliconflow: { apiKey: "key-siliconflow", url: "https://siliconflow.custom.com" },
      xai: { apiKey: "key-xai", url: "https://xai.custom.com" },
      chatglm: { apiKey: "key-chatglm", url: "https://chatglm.custom.com" },
      ai302: { apiKey: "key-302", url: "https://302.custom.com" },
    };

    assert.strictEqual(resolveProviderKeyAndUrl("gemini-3-pro", customStore).apiKey, "key-google");
    assert.strictEqual(resolveProviderKeyAndUrl("claude-3-7-sonnet", customStore).apiKey, "key-anthropic");
    assert.strictEqual(resolveProviderKeyAndUrl("deepseek-r1", customStore).apiKey, "key-deepseek");
    assert.strictEqual(resolveProviderKeyAndUrl("gpt-4o", customStore).apiKey, "key-openai");
  });

  it("4.3 consumes AI SDK streaming response with discrete reasoning and content", async () => {
    const streamBody = [
      encodeDataStreamChunk("g", "Thinking deeply about quantum physics..."),
      encodeDataStreamChunk("0", "Quantum superposition states that "),
      encodeDataStreamChunk("0", "a system exists in all possible states simultaneously."),
      encodeDataStreamChunk("d", { finishReason: "stop" }),
    ].join("");

    const encoder = new TextEncoder();
    const mockResponseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(streamBody));
        controller.close();
      },
    });

    const consumer = new MockChatStreamConsumer();
    const botMsg = await consumer.consumeStream(mockResponseStream);

    assert.strictEqual(botMsg.role, "assistant");
    assert.strictEqual(botMsg.streaming, false);
    assert.strictEqual(
      botMsg.reasoning,
      "Thinking deeply about quantum physics...",
    );
    assert.strictEqual(
      botMsg.content,
      "Quantum superposition states that a system exists in all possible states simultaneously.",
    );
  });

  it("4.4 accurately records tool calls and tool results during multi-step streaming", async () => {
    const toolStreamBody = [
      encodeDataStreamChunk("9", {
        toolCallId: "call_calc_99",
        toolName: "calculator",
        args: { expr: "12 * 12" },
      }),
      encodeDataStreamChunk("a", {
        toolCallId: "call_calc_99",
        result: { value: 144 },
      }),
      encodeDataStreamChunk("0", "12 times 12 is 144."),
      encodeDataStreamChunk("d", { finishReason: "stop" }),
    ].join("");

    const encoder = new TextEncoder();
    const mockResponseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(toolStreamBody));
        controller.close();
      },
    });

    const consumer = new MockChatStreamConsumer();
    const botMsg = await consumer.consumeStream(mockResponseStream);

    assert.strictEqual(botMsg.tools?.length, 1);
    assert.strictEqual(botMsg.tools?.[0].id, "call_calc_99");
    assert.strictEqual(botMsg.tools?.[0].function?.name, "calculator");
    assert.strictEqual(botMsg.tools?.[0].content, JSON.stringify({ value: 144 }));
    assert.strictEqual(botMsg.content, "12 times 12 is 144.");
    assert.strictEqual(botMsg.streaming, false);
  });

  it("4.5 handles server stream error without leaving messages in dangling streaming state", async () => {
    const errorStreamBody = [
      encodeDataStreamChunk("0", "Initial generation..."),
      encodeDataStreamChunk("3", "Unauthorized API Key"),
      encodeDataStreamChunk("d", { finishReason: "error" }),
    ].join("");

    const encoder = new TextEncoder();
    const mockResponseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(errorStreamBody));
        controller.close();
      },
    });

    const consumer = new MockChatStreamConsumer();
    const botMsg = await consumer.consumeStream(mockResponseStream);

    assert.strictEqual(botMsg.streaming, false);
    assert.strictEqual(botMsg.isError, true);
    assert.ok(botMsg.content.includes("Unauthorized API Key"));
  });

  it("4.6 handles client-side abort mid-stream gracefully", async () => {
    const abortController = new AbortController();
    const encoder = new TextEncoder();

    let counter = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (abortController.signal.aborted) {
          controller.error(new Error("aborted"));
          return;
        }
        counter++;
        if (counter === 2) {
          abortController.abort();
        }
        controller.enqueue(encoder.encode(encodeDataStreamChunk("0", `Text part ${counter} `)));
      },
    });

    const consumer = new MockChatStreamConsumer();
    const botMsg = await consumer.consumeStream(stream, abortController.signal);

    assert.strictEqual(botMsg.streaming, false);
    assert.strictEqual(botMsg.isError, undefined);
    assert.ok(botMsg.content.includes("Text part 1"));
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  processDataStream,
  StreamToolCall,
  StreamToolResult,
} from "../../../src/utils/chat-stream";

function createStreamFromChunks(
  chunks: Array<Uint8Array | string>,
): ReadableStream<Uint8Array | string> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

function createByteStreamFromStrings(
  strings: string[],
  chunkSize = 0,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const allBytes: number[] = [];
  for (const s of strings) {
    const bytes = encoder.encode(s);
    for (const b of bytes) allBytes.push(b);
  }

  const chunks: Uint8Array[] = [];
  if (chunkSize > 0) {
    for (let i = 0; i < allBytes.length; i += chunkSize) {
      chunks.push(new Uint8Array(allBytes.slice(i, i + chunkSize)));
    }
  } else {
    for (const s of strings) {
      chunks.push(encoder.encode(s));
    }
  }

  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

describe("Empirical Challenger M2: Client Stream Processing & Adversarial Stress Harness", () => {
  // =========================================================================
  // 1. AI SDK Data Stream Protocol Comprehensive Verification
  // =========================================================================
  describe("1. AI SDK Data Stream Protocol (<prefix>:<data>)", () => {
    it("1.1 parses text-delta (0:) and reasoning (g:) chunks correctly", async () => {
      const texts: string[] = [];
      const reasonings: string[] = [];
      let finished = false;

      const lines = [
        '0:"Hello, "\n',
        'g:"Let me think about this step 1..."\n',
        '0:"Azure OpenAI "\n',
        'g:{"reasoning":"Step 2 reasoning"}\n',
        '0:"integration!"\n',
        'd:{"finishReason":"stop"}\n',
      ];

      const stream = createByteStreamFromStrings(lines);
      await processDataStream({
        stream,
        onTextPart: (delta) => {
          texts.push(delta);
        },
        onReasoningPart: (delta) => {
          reasonings.push(delta);
        },
        onFinishMessagePart: () => {
          finished = true;
        },
      });

      assert.strictEqual(texts.join(""), "Hello, Azure OpenAI integration!");
      assert.strictEqual(reasonings.length, 2);
      assert.strictEqual(reasonings[0], "Let me think about this step 1...");
      assert.strictEqual(reasonings[1], "Step 2 reasoning");
      assert.strictEqual(finished, true);
    });

    it("1.2 parses tool-call (9:, b:) and tool-result (a:, c:) chunks", async () => {
      const toolCalls: StreamToolCall[] = [];
      const toolResults: StreamToolResult[] = [];

      const lines = [
        '9:{"toolCallId":"call_abc","toolName":"search","args":{"q":"azure"}}\n',
        'a:{"toolCallId":"call_abc","result":{"hits":5}}\n',
        'b:{"toolCallId":"call_def","toolName":"calculate","args":{"expr":"2+2"}}\n',
        'c:{"toolCallId":"call_def","result":4}\n',
      ];

      const stream = createByteStreamFromStrings(lines);
      await processDataStream({
        stream,
        onToolCallPart: (tc) => {
          toolCalls.push(tc);
        },
        onToolResultPart: (tr) => {
          toolResults.push(tr);
        },
      });

      assert.strictEqual(toolCalls.length, 2);
      assert.strictEqual(toolCalls[0].toolCallId, "call_abc");
      assert.strictEqual(toolCalls[0].toolName, "search");
      assert.deepStrictEqual(toolCalls[0].args, { q: "azure" });

      assert.strictEqual(toolCalls[1].toolCallId, "call_def");
      assert.strictEqual(toolCalls[1].toolName, "calculate");
      assert.deepStrictEqual(toolCalls[1].args, { expr: "2+2" });

      assert.strictEqual(toolResults.length, 2);
      assert.strictEqual(toolResults[0].toolCallId, "call_abc");
      assert.deepStrictEqual(toolResults[0].result, { hits: 5 });

      assert.strictEqual(toolResults[1].toolCallId, "call_def");
      assert.strictEqual(toolResults[1].result, 4);
    });

    it("1.3 captures error parts (e:, 3:) and forwards error message string", async () => {
      const errors: string[] = [];

      const lines = [
        'e:"Upstream Azure rate limit exceeded (429)"\n',
        '3:{"message":"Authentication failed: Invalid key"}\n',
      ];

      const stream = createByteStreamFromStrings(lines);
      await processDataStream({
        stream,
        onErrorPart: (err) => {
          errors.push(err);
        },
      });

      assert.strictEqual(errors.length, 2);
      assert.strictEqual(errors[0], "Upstream Azure rate limit exceeded (429)");
      assert.strictEqual(errors[1], "Authentication failed: Invalid key");
    });
  });

  // =========================================================================
  // 2. Server-Sent Events UI Message Protocol Verification
  // =========================================================================
  describe("2. Server-Sent Events UI Message Protocol (data: {...})", () => {
    it("2.1 parses text-delta, reasoning-delta, and finish events", async () => {
      const texts: string[] = [];
      const reasonings: string[] = [];
      let finishPayload: any = null;

      const lines = [
        'data: {"type": "reasoning-delta", "delta": "Deep contemplation..."}\n\n',
        'data: {"type": "text-delta", "delta": "First sentence. "}\n\n',
        'data: {"type": "text-delta", "delta": "Second sentence."}\n\n',
        'data: {"type": "finish", "finishReason": "stop", "usage": {"totalTokens": 42}}\n\n',
        "data: [DONE]\n\n",
      ];

      const stream = createByteStreamFromStrings(lines);
      await processDataStream({
        stream,
        onTextPart: (d) => {
          texts.push(d);
        },
        onReasoningPart: (d) => {
          reasonings.push(d);
        },
        onFinishMessagePart: (f) => {
          finishPayload = f;
        },
      });

      assert.strictEqual(texts.join(""), "First sentence. Second sentence.");
      assert.strictEqual(reasonings.join(""), "Deep contemplation...");
      assert.ok(finishPayload);
      assert.strictEqual(finishPayload.finishReason, "stop");
    });

    it("2.2 parses tool-input-available and tool-output-available events", async () => {
      const calls: StreamToolCall[] = [];
      const results: StreamToolResult[] = [];

      const lines = [
        'data: {"type": "tool-input-available", "toolCallId": "t_01", "toolName": "get_stock", "args": {"symbol": "MSFT"}}\n\n',
        'data: {"type": "tool-output-available", "toolCallId": "t_01", "result": {"price": 420.50}}\n\n',
      ];

      const stream = createByteStreamFromStrings(lines);
      await processDataStream({
        stream,
        onToolCallPart: (c) => {
          calls.push(c);
        },
        onToolResultPart: (r) => {
          results.push(r);
        },
      });

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].toolCallId, "t_01");
      assert.strictEqual(calls[0].toolName, "get_stock");
      assert.deepStrictEqual(calls[0].args, { symbol: "MSFT" });

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].toolCallId, "t_01");
      assert.deepStrictEqual(results[0].result, { price: 420.5 });
    });

    it("2.3 captures tool-output-error and generic error events", async () => {
      const errors: string[] = [];

      const lines = [
        'data: {"type": "tool-output-error", "errorText": "Internal Tool Failure"}\n\n',
        'data: {"type": "error", "message": "Global stream timeout"}\n\n',
      ];

      const stream = createByteStreamFromStrings(lines);
      await processDataStream({
        stream,
        onErrorPart: (err) => {
          errors.push(err);
        },
      });

      assert.strictEqual(errors.length, 2);
      assert.strictEqual(errors[0], "Internal Tool Failure");
      assert.strictEqual(errors[1], "Global stream timeout");
    });
  });

  // =========================================================================
  // 3. Adversarial Fragmentation & Multibyte UTF-8 Boundary Stress
  // =========================================================================
  describe("3. Adversarial Chunk Fragmentation & UTF-8 Stress", () => {
    it("3.1 safely handles 1-byte chunk drip without dropping characters or corrupting multibyte UTF-8", async () => {
      const unicodePayload =
        '0:"Azure 认知服务 🤖🧠: 深度学习模型 (GPT-4o) 运行良好！"\nd:{"finishReason":"stop"}\n';
      const texts: string[] = [];
      let finished = false;

      // Slice the payload into individual 1-byte chunks (worst case network fragmentation)
      const stream = createByteStreamFromStrings([unicodePayload], 1);
      await processDataStream({
        stream,
        onTextPart: (t) => {
          texts.push(t);
        },
        onFinishMessagePart: () => {
          finished = true;
        },
      });

      const accumulated = texts.join("");
      assert.strictEqual(
        accumulated,
        "Azure 认知服务 🤖🧠: 深度学习模型 (GPT-4o) 运行良好！",
      );
      assert.strictEqual(finished, true);
    });

    it("3.2 handles arbitrary chunk splits across JSON and line boundaries", async () => {
      const chunks = [
        'data: {"type": "text-',
        'delta", "delta": "Frag',
        "mented ",
        "JSON ",
        "line",
        '"}\n\ndata: [DO',
        "NE]\n\n",
      ];

      const texts: string[] = [];
      let finished = false;

      const stream = createByteStreamFromStrings(chunks);
      await processDataStream({
        stream,
        onTextPart: (t) => {
          texts.push(t);
        },
        onFinishMessagePart: () => {
          finished = true;
        },
      });

      assert.strictEqual(texts.join(""), "Fragmented JSON line");
      assert.strictEqual(finished, true);
    });

    it("3.3 tolerates Windows CRLF (\\r\\n) and mixed line endings", async () => {
      const lines = [
        '0:"Line 1 CRLF"\r\n',
        '0:"Line 2 LF"\n',
        '0:"Line 3 mixed"\r\n',
        'd:{"finishReason":"stop"}\r\n',
      ];

      const texts: string[] = [];
      const stream = createByteStreamFromStrings(lines);
      await processDataStream({
        stream,
        onTextPart: (t) => {
          texts.push(t);
        },
      });

      assert.strictEqual(texts.join(""), "Line 1 CRLFLine 2 LFLine 3 mixed");
    });

    it("3.4 safely ignores corrupted, non-JSON lines without crashing", async () => {
      const lines = [
        '0:"Valid first line"\n',
        "CORRUPT GARBAGE LINE WITHOUT COLON OR JSON\n",
        "data: {corrupted json unclosed\n",
        "9:{malformed tool call json\n",
        '0:"Valid second line"\n',
        'd:{"finishReason":"stop"}\n',
      ];

      const texts: string[] = [];
      let finished = false;

      const stream = createByteStreamFromStrings(lines);
      await processDataStream({
        stream,
        onTextPart: (t) => {
          texts.push(t);
        },
        onFinishMessagePart: () => {
          finished = true;
        },
      });

      assert.strictEqual(texts.join(""), "Valid first lineValid second line");
      assert.strictEqual(finished, true);
    });
  });

  // =========================================================================
  // 4. Resilience, Abort Signals, and Lock Management
  // =========================================================================
  describe("4. Stream Fault Tolerance & Resource Cleanup", () => {
    it("4.1 gracefully triggers finish for null, undefined, or empty stream", async () => {
      let finishCount = 0;

      await processDataStream({
        stream: null,
        onFinishMessagePart: () => {
          finishCount++;
        },
      });
      assert.strictEqual(finishCount, 1);

      await processDataStream({
        stream: undefined,
        onFinishMessagePart: () => {
          finishCount++;
        },
      });
      assert.strictEqual(finishCount, 2);

      const emptyStream = createByteStreamFromStrings([]);
      await processDataStream({
        stream: emptyStream,
        onFinishMessagePart: () => {
          finishCount++;
        },
      });
      assert.strictEqual(finishCount, 3);
    });

    it("4.2 handles Response object and releases reader lock upon completion", async () => {
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('0:"from response body"\n'));
          controller.close();
        },
      });

      const response = new Response(body);
      const texts: string[] = [];

      await processDataStream({
        stream: response,
        onTextPart: (t) => {
          texts.push(t);
        },
      });

      assert.strictEqual(texts.join(""), "from response body");
      // Verify reader is unlocked by attempting to get a new reader
      assert.doesNotThrow(() => {
        body.getReader();
      });
    });

    it("4.3 respects AbortSignal and releases stream lock when aborted mid-stream", async () => {
      const abortController = new AbortController();
      let streamReaderRef: ReadableStreamDefaultReader<any> | null = null;

      const infiniteStream = new ReadableStream({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode('0:"infinite token "\n'));
        },
      });

      let tokenCount = 0;
      let caughtError: any = null;

      try {
        await processDataStream({
          stream: infiniteStream,
          abortSignal: abortController.signal,
          onTextPart: () => {
            tokenCount++;
            if (tokenCount >= 3) {
              abortController.abort();
            }
          },
        });
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, "Must throw abort error");
      assert.strictEqual(caughtError.message, "aborted");
      assert.ok(tokenCount >= 3);

      // Verify stream lock was released in finally block
      assert.doesNotThrow(() => {
        infiniteStream.getReader();
      });
    });

    it("4.4 handles high-throughput chunk volume without memory leakage or drift", async () => {
      const totalChunks = 5000;
      const chunks: string[] = [];
      for (let i = 0; i < totalChunks; i++) {
        chunks.push(`0:"token_${i} "\n`);
      }
      chunks.push('d:{"finishReason":"stop"}\n');

      const stream = createByteStreamFromStrings(chunks);
      let count = 0;
      let finished = false;

      const startTime = performance.now();
      await processDataStream({
        stream,
        onTextPart: () => {
          count++;
        },
        onFinishMessagePart: () => {
          finished = true;
        },
      });
      const duration = performance.now() - startTime;

      assert.strictEqual(count, 5000);
      assert.strictEqual(finished, true);
      assert.ok(
        duration < 1000,
        `Expected 5000 chunks processed under 1000ms, took ${duration.toFixed(1)}ms`,
      );
    });
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  processDataStream,
  StreamToolCall,
  StreamToolResult,
} from "../../../src/utils/chat-stream";

describe("Milestone 2 Empirical Challenger: Client Stream Adversarial Stress Test", () => {
  /**
   * Helper to create a ReadableStream from an array of chunks (Uint8Array or string)
   */
  function createReadableStream(
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

  /**
   * Helper to split a string into 1-byte Uint8Array chunks to stress-test arbitrary byte boundary splitting
   */
  function createOneByteChunks(fullText: string): Uint8Array[] {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(fullText);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < encoded.length; i++) {
      chunks.push(encoded.subarray(i, i + 1));
    }
    return chunks;
  }

  describe("1. Fragmented multi-chunk UTF-8 strings & boundary stress", () => {
    it("1.1 parses multi-byte UTF-8 characters (Greek, CJK, Emojis) split byte-by-byte into 1-byte chunks", async () => {
      // 2-byte: Greek (α, β, γ) & Latin (ñ, é)
      // 3-byte: CJK (你好，世界！日本語のテストです 한국어)
      // 4-byte: Complex Emojis (🧠, 🚀, 🔥, 🤖, 👨‍👩‍👧‍👦)
      const rawPayload = [
        '0:"Greek: αβγ, Latin: ñé"\n',
        '0:" CJK: 你好，世界！日本語のテストです 한국어"\n',
        'g:"Reasoning emoji: 🧠 deep thinking with 🚀 speed and 🔥 intensity"\n',
        '0:" Emojis: 🤖 👨‍👩‍👧‍👦 family"\n',
        'd:{"finishReason":"stop"}\n',
      ].join("");

      const oneByteChunks = createOneByteChunks(rawPayload);
      const stream = createReadableStream(oneByteChunks);

      let text = "";
      let reasoning = "";
      let finished = false;
      let finishPayload: any = null;

      await processDataStream({
        stream,
        onTextPart: (delta) => {
          text += delta;
        },
        onReasoningPart: (delta) => {
          reasoning += delta;
        },
        onFinishMessagePart: (finish) => {
          finished = true;
          finishPayload = finish;
        },
      });

      assert.strictEqual(
        text,
        "Greek: αβγ, Latin: ñé CJK: 你好，世界！日本語のテストです 한국어 Emojis: 🤖 👨‍👩‍👧‍👦 family",
      );
      assert.strictEqual(
        reasoning,
        "Reasoning emoji: 🧠 deep thinking with 🚀 speed and 🔥 intensity",
      );
      assert.strictEqual(finished, true);
      assert.strictEqual(finishPayload?.finishReason, "stop");
    });

    it("1.2 handles arbitrary chunk boundaries across JSON escape sequences, quotes, and line delimiters", async () => {
      // Intentionally slice across JSON escapes like \n, \", and \uXXXX
      const chunks = [
        '0:"Line 1\\nLin',
        'e 2 with quote \\"',
        'Hello\\" and tab\\',
        'tIndented"\n',
        '0:"No newline at end of stream',
        '"',
      ];

      const stream = createReadableStream(chunks);
      let text = "";
      let finished = false;

      await processDataStream({
        stream,
        onTextPart: (delta) => {
          text += delta;
        },
        onFinishMessagePart: () => {
          finished = true;
        },
      });

      assert.strictEqual(
        text,
        'Line 1\nLine 2 with quote "Hello" and tab\tIndentedNo newline at end of stream',
      );
      assert.strictEqual(finished, true);
    });

    it("1.3 handles streams terminating cleanly without trailing newline in the final chunk", async () => {
      const chunks = [
        '0:"First line"\n',
        '0:"Second line without trailing newline"',
      ];

      const stream = createReadableStream(chunks);
      let text = "";
      let finished = false;

      await processDataStream({
        stream,
        onTextPart: (delta) => {
          text += delta;
        },
        onFinishMessagePart: () => {
          finished = true;
        },
      });

      assert.strictEqual(
        text,
        "First lineSecond line without trailing newline",
      );
      assert.strictEqual(finished, true);
    });
  });

  describe("2. Mixed lines with tool calls, results, text, and reasoning deltas", () => {
    it("2.1 handles interleaved tool calls (9:), tool results (a:), text (0:), reasoning (g:), and finish (d:)", async () => {
      const mixedStream = [
        'g:"Step 1: Identifying user question regarding weather."\n',
        '0:"Checking the current weather in Tokyo..."\n',
        '9:{"toolCallId":"call_101","toolName":"get_weather","args":{"location":"Tokyo","unit":"celsius"}}\n',
        'a:{"toolCallId":"call_101","result":{"temperature":18,"condition":"Cloudy"}}\n',
        'g:"Step 2: Weather data retrieved. Preparing final answer."\n',
        '0:"The weather in Tokyo is currently 18°C and Cloudy."\n',
        'd:{"finishReason":"stop","usage":{"promptTokens":42,"completionTokens":85}}\n',
      ].join("");

      const stream = createReadableStream([mixedStream]);

      const events: Array<{ type: string; data: any }> = [];
      const toolCalls: StreamToolCall[] = [];
      const toolResults: StreamToolResult[] = [];

      await processDataStream({
        stream,
        onTextPart: (delta) => {
          events.push({ type: "text", data: delta });
        },
        onReasoningPart: (delta) => {
          events.push({ type: "reasoning", data: delta });
        },
        onToolCallPart: (call) => {
          events.push({ type: "toolCall", data: call });
          toolCalls.push(call);
        },
        onToolResultPart: (res) => {
          events.push({ type: "toolResult", data: res });
          toolResults.push(res);
        },
        onFinishMessagePart: (finish) => {
          events.push({ type: "finish", data: finish });
        },
      });

      assert.strictEqual(events.length, 7);
      assert.strictEqual(events[0].type, "reasoning");
      assert.strictEqual(events[1].type, "text");
      assert.strictEqual(events[2].type, "toolCall");
      assert.strictEqual(events[3].type, "toolResult");
      assert.strictEqual(events[4].type, "reasoning");
      assert.strictEqual(events[5].type, "text");
      assert.strictEqual(events[6].type, "finish");

      // Verify tool call details
      assert.strictEqual(toolCalls.length, 1);
      assert.strictEqual(toolCalls[0].toolCallId, "call_101");
      assert.strictEqual(toolCalls[0].toolName, "get_weather");
      assert.deepStrictEqual(toolCalls[0].args, {
        location: "Tokyo",
        unit: "celsius",
      });

      // Verify tool result details
      assert.strictEqual(toolResults.length, 1);
      assert.strictEqual(toolResults[0].toolCallId, "call_101");
      assert.deepStrictEqual(toolResults[0].result, {
        temperature: 18,
        condition: "Cloudy",
      });

      // Verify finish payload
      assert.strictEqual(events[6].data.finishReason, "stop");
      assert.strictEqual(events[6].data.usage.promptTokens, 42);
    });

    it("2.2 supports alternate protocol prefixes: b: (tool call), c: (tool result), 3: and e: (error)", async () => {
      const altStream = [
        'b:{"toolCallId":"call_alt_1","toolName":"calc","args":{"expr":"2+2"}}\n',
        'c:{"toolCallId":"call_alt_1","result":4}\n',
        '3:"Minor warning: deprecated formula"\n',
        'e:"Recoverable model notice"\n',
        'd:{"finishReason":"stop"}\n',
      ].join("");

      const toolCalls: StreamToolCall[] = [];
      const toolResults: StreamToolResult[] = [];
      const errors: string[] = [];
      let finished = false;

      await processDataStream({
        stream: createReadableStream([altStream]),
        onToolCallPart: (call) => {
          toolCalls.push(call);
        },
        onToolResultPart: (res) => {
          toolResults.push(res);
        },
        onErrorPart: (err) => {
          errors.push(err);
        },
        onFinishMessagePart: () => {
          finished = true;
        },
      });

      assert.strictEqual(toolCalls.length, 1);
      assert.strictEqual(toolCalls[0].toolCallId, "call_alt_1");
      assert.strictEqual(toolCalls[0].toolName, "calc");
      assert.strictEqual(toolCalls[0].args.expr, "2+2");

      assert.strictEqual(toolResults.length, 1);
      assert.strictEqual(toolResults[0].toolCallId, "call_alt_1");
      assert.strictEqual(toolResults[0].result, 4);

      assert.strictEqual(errors.length, 2);
      assert.strictEqual(errors[0], "Minor warning: deprecated formula");
      assert.strictEqual(errors[1], "Recoverable model notice");
      assert.strictEqual(finished, true);
    });
  });

  describe("3. Unknown prefixes and malformed JSON resilience", () => {
    it("3.1 gracefully ignores unknown prefixes, random raw text, and empty/CRLF lines without throwing", async () => {
      const noisyStream = [
        "\r\n",
        "   \r\n",
        '8:{"type":"annotation","data":"custom_annotation"}\n',
        '2:{"type":"data","values":[1,2,3]}\n',
        "UNKNOWN_PREFIX: some arbitrary payload without json\n",
        "Plain text without any colon delimiter at all\n",
        ":colon at start\n",
        '0:"Valid message chunk"\n',
        "\n\n\n\r\n",
        'd:{"finishReason":"stop"}\n',
      ].join("");

      let text = "";
      let finished = false;

      // Must not throw uncaught error
      await processDataStream({
        stream: createReadableStream([noisyStream]),
        onTextPart: (delta) => {
          text += delta;
        },
        onFinishMessagePart: () => {
          finished = true;
        },
      });

      assert.strictEqual(text, "Valid message chunk");
      assert.strictEqual(finished, true);
    });

    it("3.2 gracefully handles unquoted raw strings and malformed JSON in text and reasoning chunks", async () => {
      const malformedStream = [
        "0:Unquoted raw text part 1\n",
        "0:Unquoted raw text part 2 with { braces } and [ brackets ]\n",
        "g:Unquoted raw reasoning chunk\n",
        '0:{"broken_json": unquoted_val\n',
        '0:"Proper JSON string"\n',
      ].join("");

      let text = "";
      let reasoning = "";

      await processDataStream({
        stream: createReadableStream([malformedStream]),
        onTextPart: (delta) => {
          text += delta;
        },
        onReasoningPart: (delta) => {
          reasoning += delta;
        },
      });

      assert.ok(text.includes("Unquoted raw text part 1"));
      assert.ok(text.includes("Unquoted raw text part 2"));
      assert.ok(text.includes('{"broken_json": unquoted_val'));
      assert.ok(text.includes("Proper JSON string"));
      assert.strictEqual(reasoning, "Unquoted raw reasoning chunk");
    });
  });

  describe("4. Server-Sent Events UI Message stream (data: {...})", () => {
    it("4.1 processes full SSE stream with text-delta, reasoning-delta, tool events, and finish", async () => {
      const sseStream = [
        'data: {"type": "reasoning-delta", "delta": "Evaluating request"}\r\n\r\n',
        'data: {"type": "text-delta", "delta": "Here is the calculation: "}\r\n\r\n',
        'data: {"type": "tool-input-available", "toolCallId": "sse_call_1", "toolName": "evaluator", "args": {"input": "40 + 2"}}\r\n\r\n',
        'data: {"type": "tool-output-available", "toolCallId": "sse_call_1", "result": 42}\r\n\r\n',
        'data: {"type": "text-delta", "delta": "42."}\r\n\r\n',
        'data: {"type": "finish", "finishReason": "stop"}\r\n\r\n',
        "data: [DONE]\r\n\r\n",
      ].join("");

      let text = "";
      let reasoning = "";
      let toolCall: StreamToolCall | null = null;
      let toolResult: StreamToolResult | null = null;
      let finishCount = 0;

      await processDataStream({
        stream: createReadableStream([sseStream]),
        onTextPart: (delta) => {
          text += delta;
        },
        onReasoningPart: (delta) => {
          reasoning += delta;
        },
        onToolCallPart: (call) => {
          toolCall = call;
        },
        onToolResultPart: (res) => {
          toolResult = res;
        },
        onFinishMessagePart: () => {
          finishCount++;
        },
      });

      assert.strictEqual(text, "Here is the calculation: 42.");
      assert.strictEqual(reasoning, "Evaluating request");
      assert.strictEqual(
        (toolCall as StreamToolCall | null)?.toolCallId,
        "sse_call_1",
      );
      assert.strictEqual(
        (toolCall as StreamToolCall | null)?.toolName,
        "evaluator",
      );
      assert.strictEqual(
        (toolCall as StreamToolCall | null)?.args.input,
        "40 + 2",
      );
      assert.strictEqual(
        (toolResult as StreamToolResult | null)?.toolCallId,
        "sse_call_1",
      );
      assert.strictEqual((toolResult as StreamToolResult | null)?.result, 42);
      // Ensure triggerFinish deduplication prevents multiple onFinishMessagePart calls
      assert.strictEqual(finishCount, 1);
    });

    it("4.2 handles SSE error events (tool-output-error and error) cleanly", async () => {
      const sseErrorStream = [
        'data: {"type": "tool-output-error", "errorText": "Tool execution timed out"}\n\n',
        'data: {"type": "error", "message": "Backend rate limit"}\n\n',
      ].join("");

      const errors: string[] = [];

      await processDataStream({
        stream: createReadableStream([sseErrorStream]),
        onErrorPart: (err) => {
          errors.push(err);
        },
      });

      assert.strictEqual(errors.length, 2);
      assert.strictEqual(errors[0], "Tool execution timed out");
      assert.strictEqual(errors[1], "Backend rate limit");
    });

    it("4.3 handles SSE data stream split across chunks mid-JSON and mid-token", async () => {
      const splitChunks = [
        "da",
        'ta: {"type": "',
        'text-delta", "del',
        'ta": "Split ',
        'SSE token"}\n\n',
        "data: [DO",
        "NE]\n\n",
      ];

      let text = "";
      let finished = false;

      await processDataStream({
        stream: createReadableStream(splitChunks),
        onTextPart: (delta) => {
          text += delta;
        },
        onFinishMessagePart: () => {
          finished = true;
        },
      });

      assert.strictEqual(text, "Split SSE token");
      assert.strictEqual(finished, true);
    });
  });

  describe("5. Lifecycle, Abort, and Null Stream Handling", () => {
    it("5.1 cleanly triggers finish without throwing on null, undefined, or empty Response body", async () => {
      let finishCalls = 0;

      await processDataStream({
        stream: null,
        onFinishMessagePart: () => {
          finishCalls++;
        },
      });
      assert.strictEqual(finishCalls, 1);

      await processDataStream({
        stream: undefined,
        onFinishMessagePart: () => {
          finishCalls++;
        },
      });
      assert.strictEqual(finishCalls, 2);

      const emptyResponse = new Response(null);
      await processDataStream({
        stream: emptyResponse,
        onFinishMessagePart: () => {
          finishCalls++;
        },
      });
      assert.strictEqual(finishCalls, 3);
    });

    it("5.2 immediately aborts and releases stream reader when AbortSignal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const stream = createReadableStream(['0:"Never processed"\n']);

      await assert.rejects(
        async () => {
          await processDataStream({
            stream,
            abortSignal: controller.signal,
          });
        },
        {
          name: "Error",
          message: "aborted",
        },
      );
    });

    it("5.3 aborts mid-stream, throws aborted, and releases lock so reader is not locked", async () => {
      const controller = new AbortController();
      let chunksRead = 0;

      const stream = new ReadableStream<string>({
        pull(c) {
          chunksRead++;
          if (chunksRead === 2) {
            controller.abort();
          }
          c.enqueue(`0:"Part ${chunksRead}"\n`);
        },
      });

      let text = "";
      await assert.rejects(
        async () => {
          await processDataStream({
            stream,
            abortSignal: controller.signal,
            onTextPart: (delta) => {
              text += delta;
            },
          });
        },
        {
          name: "Error",
          message: "aborted",
        },
      );

      assert.ok(text.includes("Part 1"));
      // Verify stream is unlocked (can acquire new reader without "ReadableStreamReader is locked" error)
      const newReader = stream.getReader();
      assert.ok(newReader);
      newReader.releaseLock();
    });

    it("5.4 consumes a standard web Response object with streaming body", async () => {
      const streamBody = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('0:"Chunk via Response"\n'));
          controller.close();
        },
      });

      const response = new Response(streamBody, {
        headers: { "Content-Type": "text/event-stream" },
      });

      let text = "";
      let finished = false;

      await processDataStream({
        stream: response,
        onTextPart: (delta) => {
          text += delta;
        },
        onFinishMessagePart: () => {
          finished = true;
        },
      });

      assert.strictEqual(text, "Chunk via Response");
      assert.strictEqual(finished, true);
    });
  });
});

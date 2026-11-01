import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { formatThinkingDuration } from "../../../src/utils/thinking";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";

describe("Milestone 5 Empirical Challenger Deep Verification & Stress Suite", () => {
  // =========================================================================
  // 1. SCSS Stylesheet & Visual Stability Constraints Verification
  // =========================================================================
  describe("1. SCSS Stylesheet & Visual Stability Constraints", () => {
    it("1.1 enforces max-height 480px and overflow-y auto for large reasoning blocks", () => {
      const scssPath = path.resolve(
        process.cwd(),
        "src/components/chat/thinking-block.module.scss",
      );
      assert.ok(fs.existsSync(scssPath), "SCSS file must exist");
      const scssContent = fs.readFileSync(scssPath, "utf-8");

      assert.ok(
        scssContent.includes("max-height: 480px"),
        "Must constrain thinking body max-height to 480px",
      );
      assert.ok(
        scssContent.includes("overflow-y: auto"),
        "Must enable scrollable overflow-y for large contents",
      );
      assert.ok(
        scssContent.includes(".thinking-pulse"),
        "Must include thinking pulse indicator",
      );
      assert.ok(
        scssContent.includes("@keyframes thinking-glow"),
        "Must include thinking-glow animation keyframes",
      );
    });

    it("1.2 enforces chevron rotation transition on collapse toggle", () => {
      const scssPath = path.resolve(
        process.cwd(),
        "src/components/chat/thinking-block.module.scss",
      );
      const scssContent = fs.readFileSync(scssPath, "utf-8");

      assert.ok(
        scssContent.includes(".thinking-chevron"),
        "Must define thinking-chevron",
      );
      assert.ok(
        scssContent.includes("transform: rotate(180deg)"),
        "Must rotate chevron 180deg when expanded",
      );
    });
  });

  // =========================================================================
  // 2. Chat Component & Markdown Loading Coordination
  // =========================================================================
  describe("2. Chat Component & Markdown Loading Coordination", () => {
    it("2.1 verifies ThinkingBlock component integration in chat.tsx", () => {
      const chatTsxPath = path.resolve(
        process.cwd(),
        "src/components/chat.tsx",
      );
      assert.ok(fs.existsSync(chatTsxPath), "chat.tsx must exist");
      const chatContent = fs.readFileSync(chatTsxPath, "utf-8");

      assert.ok(
        chatContent.includes("<ThinkingBlock"),
        "chat.tsx must render <ThinkingBlock />",
      );
      assert.ok(
        chatContent.includes("reasoning={message.reasoning}"),
        "chat.tsx must pass reasoning prop",
      );
      assert.ok(
        chatContent.includes("streaming={message.streaming}"),
        "chat.tsx must pass streaming prop",
      );
      assert.ok(
        chatContent.includes("duration={message.reasoningDuration}"),
        "chat.tsx must pass duration prop",
      );
    });

    it("2.2 verifies duplicate loading dots suppression while thoughts stream", () => {
      const chatTsxPath = path.resolve(
        process.cwd(),
        "src/components/chat.tsx",
      );
      const chatContent = fs.readFileSync(chatTsxPath, "utf-8");

      assert.ok(
        chatContent.includes("!message.reasoning"),
        "chat.tsx must suppress markdown loading dots when reasoning is present",
      );
    });
  });

  // =========================================================================
  // 3. Multi-turn Session & Complex Interleaved Stream Ingestion
  // =========================================================================
  describe("3. Complex Interleaved Stream & Error Recovery", () => {
    it("3.1 handles stream with reasoning followed by tool execution and final answer", () => {
      const complexStream = [
        encodeDataStreamChunk(
          "g",
          "I need to look up the current stock price.\n",
        ),
        encodeDataStreamChunk("9", {
          toolCallId: "call_stock_1",
          toolName: "get_stock_price",
          args: { symbol: "AAPL" },
        }),
        encodeDataStreamChunk("a", {
          toolCallId: "call_stock_1",
          result: { price: 230.5 },
        }),
        encodeDataStreamChunk(
          "g",
          "The price is $230.50. Now formatting final response.\n",
        ),
        encodeDataStreamChunk(
          "0",
          "Apple Inc. (AAPL) is currently trading at $230.50.",
        ),
        encodeDataStreamChunk("d", { finishReason: "stop" }),
      ].join("");

      const chunks = parseDataStreamResponse(complexStream);
      const state = accumulateStreamState(chunks);

      assert.ok(state.reasoning.includes("look up the current stock price"));
      assert.ok(state.reasoning.includes("formatting final response"));
      assert.ok(
        state.text.includes(
          "Apple Inc. (AAPL) is currently trading at $230.50.",
        ),
      );
      assert.strictEqual(state.toolCalls.length, 1);
      assert.strictEqual(state.toolCalls[0].toolName, "get_stock_price");
      assert.strictEqual(state.toolResults.length, 1);
      assert.strictEqual(state.isFinished, true);
    });

    it("3.2 handles stream error occurring mid-reasoning without crash", () => {
      const errorStream = [
        encodeDataStreamChunk("g", "Starting reasoning process..."),
        encodeDataStreamChunk("e", "Upstream API rate limit exceeded"),
      ].join("");

      const chunks = parseDataStreamResponse(errorStream);
      assert.strictEqual(chunks.length, 2);
      assert.strictEqual(chunks[0].type, "reasoning");
      assert.strictEqual(chunks[0].data, "Starting reasoning process...");
      assert.strictEqual(chunks[1].type, "error");
      assert.strictEqual(chunks[1].data, "Upstream API rate limit exceeded");
    });
  });

  // =========================================================================
  // 4. Multi-language and Extreme Duration Formats
  // =========================================================================
  describe("4. Multi-language and Extreme Duration Formats", () => {
    it("4.1 formats durations up to 1000 hours in all supported languages", () => {
      const ms1000h = 1000 * 3600_000;
      assert.strictEqual(
        formatThinkingDuration(ms1000h, "en"),
        "Thought for 1000.0h",
      );
      assert.strictEqual(
        formatThinkingDuration(ms1000h, "cn"),
        "思考耗时 1000.0 小时",
      );
      assert.strictEqual(
        formatThinkingDuration(ms1000h, "jp"),
        "思考時間 1000.0 時間",
      );
      assert.strictEqual(
        formatThinkingDuration(ms1000h, "fr"),
        "Pensé pendant 1000.0h",
      );
    });

    it("4.2 formats 1 second boundary across all supported languages", () => {
      assert.strictEqual(
        formatThinkingDuration(1000, "en"),
        "Thought for 1.0s",
      );
      assert.strictEqual(formatThinkingDuration(1000, "cn"), "思考耗时 1.0 秒");
      assert.strictEqual(formatThinkingDuration(1000, "jp"), "思考時間 1.0 秒");
      assert.strictEqual(
        formatThinkingDuration(1000, "fr"),
        "Pensé pendant 1.0s",
      );
    });
  });
});

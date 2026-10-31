import test, { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";

describe("Tier 4 Scenario 5: OpenAPI Plugin Multi-Step Tool Execution Flow", () => {
  it("orchestrates sequential multi-step tool calls and synthesizes final answer", () => {
    // 1. User prompts for multi-location weather comparison
    const conversation = [
      {
        role: "user",
        content: "Compare the weather between Paris and Rome right now.",
      },
    ];

    // 2. AI SDK engine triggers Step 1 (Paris weather) then Step 2 (Rome weather) and synthesizes
    const multiStepStream = [
      // Step 1: Paris
      encodeDataStreamChunk("9", {
        toolCallId: "call_paris",
        toolName: "getCurrentWeather",
        args: { location: "Paris", unit: "celsius" },
      }),
      encodeDataStreamChunk("a", {
        toolCallId: "call_paris",
        result: { city: "Paris", temperature: 18.0, condition: "Cloudy" },
      }),
      // Step 2: Rome
      encodeDataStreamChunk("9", {
        toolCallId: "call_rome",
        toolName: "getCurrentWeather",
        args: { location: "Rome", unit: "celsius" },
      }),
      encodeDataStreamChunk("a", {
        toolCallId: "call_rome",
        result: { city: "Rome", temperature: 26.5, condition: "Sunny" },
      }),
      // Step 3: Synthesis
      encodeDataStreamChunk("0", "### Weather Comparison: Paris vs. Rome\n\n"),
      encodeDataStreamChunk("0", "- **Paris**: 18.0°C (Cloudy)\n"),
      encodeDataStreamChunk("0", "- **Rome**: 26.5°C (Sunny)\n\n"),
      encodeDataStreamChunk("0", "Rome is significantly warmer (+8.5°C) and sunnier than Paris today."),
      encodeDataStreamChunk("d", { finishReason: "stop" }),
    ].join("");

    const chunks = parseDataStreamResponse(multiStepStream);
    const state = accumulateStreamState(chunks);

    // 3. Verify tool call sequences
    assert.strictEqual(state.toolCalls.length, 2);
    assert.strictEqual(state.toolCalls[0].args.location, "Paris");
    assert.strictEqual(state.toolCalls[1].args.location, "Rome");

    // 4. Verify tool results
    assert.strictEqual(state.toolResults.length, 2);
    assert.strictEqual(state.toolResults[0].result.city, "Paris");
    assert.strictEqual(state.toolResults[1].result.city, "Rome");

    // 5. Verify final synthesized response
    assert.ok(state.text.includes("Weather Comparison: Paris vs. Rome"));
    assert.ok(state.text.includes("Rome is significantly warmer"));
    assert.strictEqual(state.isFinished, true);
  });
});

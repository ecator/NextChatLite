import test, { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";

describe("Tier 2 Boundary B15: Gemini 3 Thinking Signatures Boundaries", () => {
  it("B15-1: handles interleaved reasoning and text stream deltas", () => {
    // Model streams: thought 1 -> partial text 1 -> thought 2 -> partial text 2
    const interleavedStream = [
      encodeDataStreamChunk("g", "Step 1: Parse input.\n"),
      encodeDataStreamChunk("0", "Part 1: Input parsed. "),
      encodeDataStreamChunk("g", "Step 2: Compute result.\n"),
      encodeDataStreamChunk("0", "Part 2: Result is 100."),
      encodeDataStreamChunk("d", { finishReason: "stop" }),
    ].join("");

    const chunks = parseDataStreamResponse(interleavedStream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.reasoning, "Step 1: Parse input.\nStep 2: Compute result.\n");
    assert.strictEqual(state.text, "Part 1: Input parsed. Part 2: Result is 100.");
  });

  it("B15-2: handles markdown and LaTeX code blocks within reasoning deltas", () => {
    const complexReasoning = "Let $f(x) = x^2 + 3x$.\n```python\ndef f(x):\n    return x**2 + 3*x\n```\n";
    const stream = `${encodeDataStreamChunk("g", complexReasoning)}${encodeDataStreamChunk("0", "The function is quadratic.")}`;

    const chunks = parseDataStreamResponse(stream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.reasoning, complexReasoning);
    assert.strictEqual(state.text, "The function is quadratic.");
  });

  it("B15-3: bounds thinkingBudget parameter between [0, 65536]", () => {
    const clampThinkingBudget = (budget: any): number => {
      const b = Number(budget);
      if (isNaN(b) || b < 0) return 0;
      return Math.min(b, 65536);
    };

    assert.strictEqual(clampThinkingBudget(0), 0);
    assert.strictEqual(clampThinkingBudget(4096), 4096);
    assert.strictEqual(clampThinkingBudget(100000), 65536);
    assert.strictEqual(clampThinkingBudget(-100), 0);
  });

  it("B15-4: handles thought process containing quote characters and escaped JSON symbols", () => {
    const quoteReasoning = 'He said: "Quotes and \\slashes" are tricky in JSON.';
    const stream = `${encodeDataStreamChunk("g", quoteReasoning)}${encodeDataStreamChunk("0", "Acknowledged.")}`;

    const chunks = parseDataStreamResponse(stream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.reasoning, quoteReasoning);
    assert.strictEqual(state.text, "Acknowledged.");
  });

  it("B15-5: handles zero reasoning chunk (when model decides no extra thinking is needed)", () => {
    const emptyThinkingStream = `${encodeDataStreamChunk("0", "Fast answer without thinking.")}${encodeDataStreamChunk("d", { finishReason: "stop" })}`;
    const chunks = parseDataStreamResponse(emptyThinkingStream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.reasoning, "");
    assert.strictEqual(state.text, "Fast answer without thinking.");
  });
});

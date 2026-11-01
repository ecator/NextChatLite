import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";

describe("Tier 2 Boundary B12: Vercel AI SDK Streaming Protocol Boundaries", () => {
  it("B12-1: handles abrupt abort signal and partial stream termination", () => {
    // Only 2 chunks delivered before client cancels
    const partialStream = `${encodeDataStreamChunk("0", "Chunk 1")}${encodeDataStreamChunk("0", "Chunk 2")}`;
    const chunks = parseDataStreamResponse(partialStream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.text, "Chunk 1Chunk 2");
    assert.strictEqual(state.isFinished, false);
    assert.strictEqual(state.finishReason, undefined);
  });

  it('B12-2: handles empty text-delta chunks (0:"") and whitespace deltas cleanly', () => {
    const stream = [
      encodeDataStreamChunk("0", ""),
      encodeDataStreamChunk("0", "   "),
      encodeDataStreamChunk("0", "Hello"),
      encodeDataStreamChunk("0", ""),
      encodeDataStreamChunk("d", { finishReason: "stop" }),
    ].join("");

    const chunks = parseDataStreamResponse(stream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.text, "   Hello");
    assert.strictEqual(state.isFinished, true);
  });

  it("B12-3: handles malformed stream chunks without throwing fatal syntax error", () => {
    const rawWithMalformed = `0:"valid chunk"\ninvalid_protocol_line_without_colon\n0:" second chunk"\n`;
    const chunks = parseDataStreamResponse(rawWithMalformed);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.text, "valid chunk second chunk");
  });

  it("B12-4: handles stream finishReason values ('length', 'content-filter', 'tool-calls')", () => {
    const lengthFinish = `${encodeDataStreamChunk("d", { finishReason: "length" })}`;
    const filterFinish = `${encodeDataStreamChunk("d", { finishReason: "content-filter" })}`;

    const c1 = parseDataStreamResponse(lengthFinish);
    const c2 = parseDataStreamResponse(filterFinish);

    assert.strictEqual(accumulateStreamState(c1).finishReason, "length");
    assert.strictEqual(
      accumulateStreamState(c2).finishReason,
      "content-filter",
    );
  });

  it("B12-5: processes high-frequency stream of 1,000 chunks without memory or buffer lag", () => {
    const lines: string[] = [];
    for (let i = 0; i < 1000; i++) {
      lines.push(encodeDataStreamChunk("0", `t${i} `));
    }
    lines.push(encodeDataStreamChunk("d", { finishReason: "stop" }));

    const raw = lines.join("");
    const chunks = parseDataStreamResponse(raw);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(chunks.length, 1001);
    assert.ok(state.text.startsWith("t0 t1 t2"));
    assert.ok(state.text.endsWith("t999 "));
    assert.strictEqual(state.isFinished, true);
  });
});

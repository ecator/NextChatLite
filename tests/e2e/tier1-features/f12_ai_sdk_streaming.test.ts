import { describe, it } from "node:test";
import assert from "node:assert";
import { validateChatApiPayload } from "../fixtures/test_helpers";
import type { ChatApiPayload } from "../fixtures/test_helpers";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  createGemini3ThinkingStream,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";

describe("Feature F12: Vercel AI SDK Core Migration & Chat Streaming", () => {
  it("F12-1: validates ChatApiRequest payload schema contract", () => {
    const validPayload: ChatApiPayload = {
      messages: [
        { role: "user", content: "Explain quantum computing in one sentence." },
      ],
      model: "gemini-3-pro",
      provider: "google",
      modelConfig: {
        temperature: 0.7,
        top_p: 0.95,
        max_tokens: 2048,
        reasoningConfig: {
          thinkingLevel: "high",
        },
      },
    };

    const res = validateChatApiPayload(validPayload);
    assert.strictEqual(
      res.valid,
      true,
      `Validation failed: ${res.errors.join(", ")}`,
    );
  });

  it("F12-2: parses text-delta streaming chunks into final response", () => {
    const rawStream = `${encodeDataStreamChunk("0", "Hello ")}${encodeDataStreamChunk("0", "world!")}${encodeDataStreamChunk("d", { finishReason: "stop" })}`;
    const chunks = parseDataStreamResponse(rawStream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.text, "Hello world!");
    assert.strictEqual(state.isFinished, true);
    assert.strictEqual(state.finishReason, "stop");
  });

  it("F12-3: parses reasoning-delta chunks independently from text response", () => {
    const stream = createGemini3ThinkingStream({
      thinkingParts: [
        "First analyze the premise.",
        " Then derive the conclusion.",
      ],
      responseParts: ["The answer is 42."],
    });

    const chunks = parseDataStreamResponse(stream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(
      state.reasoning,
      "First analyze the premise. Then derive the conclusion.",
    );
    assert.strictEqual(state.text, "The answer is 42.");
    assert.strictEqual(state.isFinished, true);
  });

  it("F12-4: decodes finish chunk with token usage statistics", () => {
    const finishStream = `${encodeDataStreamChunk("0", "Done.")}${encodeDataStreamChunk("d", { finishReason: "stop", usage: { promptTokens: 15, completionTokens: 40 } })}`;
    const chunks = parseDataStreamResponse(finishStream);
    const state = accumulateStreamState(chunks);

    assert.ok(state.usage);
    assert.strictEqual(state.usage.promptTokens, 15);
    assert.strictEqual(state.usage.completionTokens, 40);
  });

  it("F12-5: handles streaming error chunks gracefully", () => {
    const errorStream = `${encodeDataStreamChunk("0", "Starting...")}${encodeDataStreamChunk("e", { message: "Rate limit exceeded", code: "rate_limit" })}`;
    const chunks = parseDataStreamResponse(errorStream);

    const errorChunk = chunks.find((c) => c.type === "error");
    assert.ok(errorChunk);
    assert.strictEqual(errorChunk.data.code, "rate_limit");
  });
});

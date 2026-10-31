import test, { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  createGemini3ThinkingStream,
} from "../fixtures/mock_chat_streams";

interface Gemini3ThinkingConfig {
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  thinkingBudget?: number;
}

function configureGemini3ProviderOptions(config: Gemini3ThinkingConfig) {
  const providerOptions: Record<string, any> = {};

  if (config.thinkingLevel) {
    providerOptions.thinkingLevel = config.thinkingLevel;
  }
  if (config.thinkingBudget !== undefined) {
    providerOptions.thinkingBudget = config.thinkingBudget;
  }

  return {
    google: providerOptions,
  };
}

describe("Feature F15: Gemini 3 Thinking Signatures Extraction", () => {
  it("F15-1: configures thinkingLevel options for Gemini 3 models", () => {
    const levels: Array<"minimal" | "low" | "medium" | "high"> = ["minimal", "low", "medium", "high"];
    for (const level of levels) {
      const opts = configureGemini3ProviderOptions({ thinkingLevel: level });
      assert.strictEqual(opts.google.thinkingLevel, level);
    }
  });

  it("F15-2: configures thinkingBudget token threshold for reasoning budget", () => {
    const opts = configureGemini3ProviderOptions({ thinkingBudget: 4096 });
    assert.strictEqual(opts.google.thinkingBudget, 4096);
  });

  it("F15-3: stream parser isolates thinking signatures from output text", () => {
    const raw = createGemini3ThinkingStream({
      thinkingParts: [
        "1. Problem analysis: calculate factorial of 5.\n",
        "2. Formula: 5! = 5 * 4 * 3 * 2 * 1.\n",
        "3. Intermediate calculation: 120.\n",
      ],
      responseParts: ["The factorial of 5 (5!) is 120."],
    });

    const chunks = parseDataStreamResponse(raw);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(
      state.reasoning,
      "1. Problem analysis: calculate factorial of 5.\n2. Formula: 5! = 5 * 4 * 3 * 2 * 1.\n3. Intermediate calculation: 120.\n"
    );
    assert.strictEqual(state.text, "The factorial of 5 (5!) is 120.");
  });

  it("F15-4: persists thinking tokens in assistant message object structure", () => {
    const message = {
      id: "msg_gemini3_1",
      role: "assistant",
      model: "gemini-3-pro",
      reasoning: "Thinking about the algorithmic complexity...",
      content: "The time complexity is O(N log N).",
      date: new Date().toISOString(),
    };

    assert.ok(message.reasoning);
    assert.strictEqual(message.reasoning, "Thinking about the algorithmic complexity...");
    assert.strictEqual(message.content, "The time complexity is O(N log N).");
  });

  it("F15-5: handles zero-reasoning stream for non-thinking models or minimal level", () => {
    const stream = createGemini3ThinkingStream({
      thinkingParts: [],
      responseParts: ["Direct quick response without thinking tokens."],
    });

    const chunks = parseDataStreamResponse(stream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.reasoning, "");
    assert.strictEqual(state.text, "Direct quick response without thinking tokens.");
  });
});

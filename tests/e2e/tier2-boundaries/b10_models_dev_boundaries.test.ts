import { describe, it } from "node:test";
import assert from "node:assert";

function parseModelMetadataSafely(raw: any): {
  id: string;
  contextLimit: number;
  outputLimit: number;
  hasVision: boolean;
  hasReasoning: boolean;
  provider: string;
} {
  const contextLimit =
    typeof raw?.contextLimit === "number" && raw.contextLimit > 0
      ? raw.contextLimit
      : 4096;
  const outputLimit =
    typeof raw?.outputLimit === "number" && raw.outputLimit > 0
      ? raw.outputLimit
      : 4096;

  return {
    id:
      typeof raw?.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : "unknown-model",
    provider:
      typeof raw?.provider === "string" && raw.provider.trim()
        ? raw.provider.trim()
        : "custom",
    contextLimit,
    outputLimit,
    hasVision: Boolean(raw?.hasVision),
    hasReasoning: Boolean(raw?.hasReasoning),
  };
}

describe("Tier 2 Boundary B10: models.dev Dynamic Metadata Boundaries", () => {
  it("B10-1: handles missing or undefined model fields with sensible defaults", () => {
    const parsed = parseModelMetadataSafely({});
    assert.strictEqual(parsed.id, "unknown-model");
    assert.strictEqual(parsed.provider, "custom");
    assert.strictEqual(parsed.contextLimit, 4096);
    assert.strictEqual(parsed.outputLimit, 4096);
    assert.strictEqual(parsed.hasVision, false);
    assert.strictEqual(parsed.hasReasoning, false);
  });

  it("B10-2: clamps negative or zero context limits to minimum default (4096)", () => {
    const parsedZero = parseModelMetadataSafely({
      contextLimit: 0,
      outputLimit: -100,
    });
    assert.strictEqual(parsedZero.contextLimit, 4096);
    assert.strictEqual(parsedZero.outputLimit, 4096);
  });

  it("B10-3: handles huge context windows (e.g. 2,000,000+ tokens for Gemini 3)", () => {
    const parsedGemini = parseModelMetadataSafely({
      id: "gemini-3-pro",
      provider: "google",
      contextLimit: 2097152,
      outputLimit: 65536,
      hasVision: true,
      hasReasoning: true,
    });

    assert.strictEqual(parsedGemini.contextLimit, 2097152);
    assert.strictEqual(parsedGemini.outputLimit, 65536);
  });

  it("B10-4: handles non-standard / newly introduced providers seamlessly", () => {
    const parsedNewProvider = parseModelMetadataSafely({
      id: "custom-deep-model",
      provider: "emerging-ai-provider",
    });

    assert.strictEqual(parsedNewProvider.provider, "emerging-ai-provider");
  });

  it("B10-5: handles non-object metadata input (null, string, array) gracefully", () => {
    assert.strictEqual(parseModelMetadataSafely(null).id, "unknown-model");
    assert.strictEqual(
      parseModelMetadataSafely("string-input").id,
      "unknown-model",
    );
    assert.strictEqual(parseModelMetadataSafely([]).id, "unknown-model");
  });
});

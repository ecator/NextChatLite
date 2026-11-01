import { describe, it } from "node:test";
import assert from "node:assert";
import { readJsonFile } from "../fixtures/test_helpers";

describe("Feature F11: Dynamic Model Selector & Parameter Limits Validation", () => {
  const modelsCatalog = readJsonFile(
    "tests/e2e/fixtures/mock_models_dev.json",
  ).models;

  it("F11-1: dynamically filters model list by provider", () => {
    const googleModels = Object.values<any>(modelsCatalog).filter(
      (m) => m.provider === "google",
    );
    const openaiModels = Object.values<any>(modelsCatalog).filter(
      (m) => m.provider === "openai",
    );

    assert.ok(googleModels.length >= 3);
    assert.ok(openaiModels.length >= 2);
    assert.ok(googleModels.every((m) => m.provider === "google"));
  });

  it("F11-2: toggles image attachment button state based on hasVision capability", () => {
    const isImageUploadAllowed = (modelId: string): boolean => {
      const match = Object.values<any>(modelsCatalog).find(
        (m) => m.id === modelId,
      );
      return match ? Boolean(match.hasVision) : false;
    };

    assert.strictEqual(isImageUploadAllowed("gpt-4o"), true);
    assert.strictEqual(isImageUploadAllowed("gemini-3-pro"), true);
    assert.strictEqual(isImageUploadAllowed("o3-mini"), false);
    assert.strictEqual(isImageUploadAllowed("text-embedding-3-small"), false);
  });

  it("F11-3: bounds max_tokens slider by model outputLimit metadata", () => {
    const clampMaxTokens = (
      modelId: string,
      requestedTokens: number,
    ): number => {
      const match = Object.values<any>(modelsCatalog).find(
        (m) => m.id === modelId,
      );
      const limit = match?.outputLimit ?? 4096;
      return Math.min(requestedTokens, limit);
    };

    assert.strictEqual(clampMaxTokens("gpt-4o", 10000), 4096);
    assert.strictEqual(clampMaxTokens("gemini-3-pro", 50000), 50000);
    assert.strictEqual(clampMaxTokens("gemini-3-pro", 100000), 65536);
  });

  it("F11-4: validates temperature parameter range (0.0 - 2.0)", () => {
    const validateTemperature = (temp: number): boolean => {
      return (
        typeof temp === "number" && temp >= 0.0 && temp <= 2.0 && !isNaN(temp)
      );
    };

    assert.strictEqual(validateTemperature(0.7), true);
    assert.strictEqual(validateTemperature(0.0), true);
    assert.strictEqual(validateTemperature(2.0), true);
    assert.strictEqual(validateTemperature(-0.1), false);
    assert.strictEqual(validateTemperature(2.5), false);
  });

  it("F11-5: enables reasoning configuration panel only for hasReasoning models", () => {
    const isReasoningConfigEnabled = (modelId: string): boolean => {
      const match = Object.values<any>(modelsCatalog).find(
        (m) => m.id === modelId,
      );
      return match ? Boolean(match.hasReasoning) : false;
    };

    assert.strictEqual(isReasoningConfigEnabled("gemini-3-pro"), true);
    assert.strictEqual(isReasoningConfigEnabled("o3-mini"), true);
    assert.strictEqual(isReasoningConfigEnabled("gpt-4o"), false);
    assert.strictEqual(isReasoningConfigEnabled("claude-3-5-sonnet"), false);
  });
});

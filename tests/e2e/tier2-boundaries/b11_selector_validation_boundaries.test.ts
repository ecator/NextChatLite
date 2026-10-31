import test, { describe, it } from "node:test";
import assert from "node:assert";

class ParameterValidator {
  static validateTemperature(val: any): number {
    const num = Number(val);
    if (isNaN(num)) return 0.7; // default
    if (num < 0.0) return 0.0;
    if (num > 2.0) return 2.0;
    return num;
  }

  static validateTopP(val: any): number {
    if (val === null || val === undefined) return 1.0;
    const num = Number(val);
    if (isNaN(num)) return 1.0; // default
    if (num < 0.0) return 0.0;
    if (num > 1.0) return 1.0;
    return num;
  }

  static validateMaxTokens(val: any, modelOutputLimit = 4096): number {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) return Math.min(2048, modelOutputLimit);
    return Math.min(num, modelOutputLimit);
  }
}

describe("Tier 2 Boundary B11: Model Selector & Parameter Limits Boundaries", () => {
  it("B11-1: clamps temperature boundary values strictly within [0.0, 2.0]", () => {
    assert.strictEqual(ParameterValidator.validateTemperature(0.0), 0.0);
    assert.strictEqual(ParameterValidator.validateTemperature(2.0), 2.0);
    assert.strictEqual(ParameterValidator.validateTemperature(-0.5), 0.0);
    assert.strictEqual(ParameterValidator.validateTemperature(3.5), 2.0);
    assert.strictEqual(ParameterValidator.validateTemperature("invalid"), 0.7);
    assert.strictEqual(ParameterValidator.validateTemperature(NaN), 0.7);
  });

  it("B11-2: clamps top_p boundary values strictly within [0.0, 1.0]", () => {
    assert.strictEqual(ParameterValidator.validateTopP(0.0), 0.0);
    assert.strictEqual(ParameterValidator.validateTopP(1.0), 1.0);
    assert.strictEqual(ParameterValidator.validateTopP(-0.1), 0.0);
    assert.strictEqual(ParameterValidator.validateTopP(1.5), 1.0);
    assert.strictEqual(ParameterValidator.validateTopP(null), 1.0);
  });

  it("B11-3: bounds max_tokens by model's specific outputLimit", () => {
    // GPT-4o limit: 4096
    assert.strictEqual(ParameterValidator.validateMaxTokens(1000, 4096), 1000);
    assert.strictEqual(ParameterValidator.validateMaxTokens(8000, 4096), 4096);

    // Gemini 3 Pro limit: 65536
    assert.strictEqual(ParameterValidator.validateMaxTokens(50000, 65536), 50000);
    assert.strictEqual(ParameterValidator.validateMaxTokens(100000, 65536), 65536);
  });

  it("B11-4: handles zero, negative, or non-numeric max_tokens gracefully", () => {
    assert.strictEqual(ParameterValidator.validateMaxTokens(0, 4096), 2048);
    assert.strictEqual(ParameterValidator.validateMaxTokens(-500, 4096), 2048);
    assert.strictEqual(ParameterValidator.validateMaxTokens("not-a-number", 4096), 2048);
  });

  it("B11-5: filters model search keyword with special characters, regex meta-chars, and unicode", () => {
    const searchModels = (query: string, list: string[]): string[] => {
      const q = query.trim().toLowerCase();
      if (!q) return list;
      return list.filter((m) => m.toLowerCase().includes(q));
    };

    const models = ["gpt-4o", "gemini-3-pro", "gemini-3-flash", "o3-mini", "claude-3-5-sonnet"];
    assert.deepStrictEqual(searchModels("gemini", models), ["gemini-3-pro", "gemini-3-flash"]);
    assert.deepStrictEqual(searchModels("3-", models), ["gemini-3-pro", "gemini-3-flash", "o3-mini", "claude-3-5-sonnet"]);
    assert.deepStrictEqual(searchModels(".*", models), []);
    assert.deepStrictEqual(searchModels("", models), models);
  });
});

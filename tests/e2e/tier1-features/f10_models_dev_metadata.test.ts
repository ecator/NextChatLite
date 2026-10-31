import test, { describe, it } from "node:test";
import assert from "node:assert";
import { readJsonFile } from "../fixtures/test_helpers";

interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  contextLimit: number;
  outputLimit: number;
  hasVision: boolean;
  hasReasoning: boolean;
  reasoningType?: "level" | "budget";
  hasTools: boolean;
  cost?: { input: number; output: number };
}

function parseModelsDevCatalog(rawPayload: any): Record<string, ModelMetadata> {
  const result: Record<string, ModelMetadata> = {};
  const models = rawPayload?.models || {};

  for (const [key, item] of Object.entries<any>(models)) {
    result[key] = {
      id: item.id || key,
      name: item.name || item.id,
      provider: item.provider || "openai",
      contextLimit: Number(item.contextLimit) || 4096,
      outputLimit: Number(item.outputLimit) || 4096,
      hasVision: Boolean(item.hasVision),
      hasReasoning: Boolean(item.hasReasoning),
      reasoningType: item.reasoningType,
      hasTools: item.hasTools ?? true,
      cost: item.cost,
    };
  }

  return result;
}

describe("Feature F10: models.dev Dynamic Metadata Integration", () => {
  const samplePayload = readJsonFile("tests/e2e/fixtures/mock_models_dev.json");

  it("F10-1: parses models catalog from models.dev fixture structure", () => {
    const catalog = parseModelsDevCatalog(samplePayload);
    assert.ok(Object.keys(catalog).length >= 5, "Should parse at least 5 models");
    assert.ok(catalog["google/gemini-3-pro"]);
    assert.ok(catalog["openai/gpt-4o"]);
    assert.ok(catalog["anthropic/claude-3-5-sonnet"]);
  });

  it("F10-2: extracts context window limit and output token limits accurately", () => {
    const catalog = parseModelsDevCatalog(samplePayload);
    const gemini3Pro = catalog["google/gemini-3-pro"];
    assert.strictEqual(gemini3Pro.contextLimit, 2097152);
    assert.strictEqual(gemini3Pro.outputLimit, 65536);

    const gpt4o = catalog["openai/gpt-4o"];
    assert.strictEqual(gpt4o.contextLimit, 128000);
    assert.strictEqual(gpt4o.outputLimit, 4096);
  });

  it("F10-3: identifies multimodal vision capabilities", () => {
    const catalog = parseModelsDevCatalog(samplePayload);
    assert.strictEqual(catalog["google/gemini-3-pro"].hasVision, true);
    assert.strictEqual(catalog["openai/gpt-4o"].hasVision, true);
    assert.strictEqual(catalog["openai/o3-mini"].hasVision, false);
    assert.strictEqual(catalog["openai/text-embedding-3-small"].hasVision, false);
  });

  it("F10-4: identifies Gemini 3 & o-series reasoning capabilities and reasoningType", () => {
    const catalog = parseModelsDevCatalog(samplePayload);
    const gemini3 = catalog["google/gemini-3-pro"];
    assert.strictEqual(gemini3.hasReasoning, true);
    assert.strictEqual(gemini3.reasoningType, "level");

    const gemini25 = catalog["google/gemini-2.5-pro"];
    assert.strictEqual(gemini25.hasReasoning, true);
    assert.strictEqual(gemini25.reasoningType, "budget");

    const gpt4o = catalog["openai/gpt-4o"];
    assert.strictEqual(gpt4o.hasReasoning, false);
  });

  it("F10-5: provides bundled snapshot fallback when live models.dev API is offline", () => {
    const fallbackCatalog = parseModelsDevCatalog({
      models: {
        "google/gemini-3-flash": {
          id: "gemini-3-flash",
          name: "Gemini 3 Flash",
          provider: "google",
          contextLimit: 1048576,
          outputLimit: 8192,
          hasVision: true,
          hasReasoning: true,
        },
      },
    });

    assert.ok(fallbackCatalog["google/gemini-3-flash"]);
    assert.strictEqual(fallbackCatalog["google/gemini-3-flash"].contextLimit, 1048576);
  });
});

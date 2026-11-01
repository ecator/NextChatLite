import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parseModelMetadataSafely,
  parseModelsDevCatalog,
  useModelStore,
} from "../../../src/store/models";
import {
  validateTemperature,
  validateTemperatureValue,
  validateTopP,
  validateMaxTokens,
  clampMaxTokens,
  clampContextLimit,
  isImageUploadAllowed,
  isReasoningConfigEnabled,
  searchModels,
} from "../../../src/utils/model-limits";

describe("Milestone 3 Empirical Challenger Deep Verification & Stress Suite", () => {
  const rootDir = process.cwd();

  // =========================================================================
  // Section 1: Catalog Parsing & Schema Normalization Robustness
  // =========================================================================
  describe("1. Catalog Parsing & Schema Normalization", () => {
    it("1.1 parses valid models.dev payload with .models object format", () => {
      const payload = {
        models: {
          "google/gemini-3-pro": {
            id: "gemini-3-pro",
            name: "Gemini 3 Pro",
            provider: "google",
            contextLimit: 2097152,
            outputLimit: 65536,
            hasVision: true,
            hasReasoning: true,
            reasoningType: "level",
            hasTools: true,
          },
        },
      };

      const catalog = parseModelsDevCatalog(payload);
      assert.ok(catalog["google/gemini-3-pro"]);
      assert.ok(catalog["gemini-3-pro"]);
      assert.strictEqual(catalog["google/gemini-3-pro"].contextLimit, 2097152);
      assert.strictEqual(catalog["google/gemini-3-pro"].outputLimit, 65536);
      assert.strictEqual(catalog["google/gemini-3-pro"].hasVision, true);
      assert.strictEqual(catalog["google/gemini-3-pro"].hasReasoning, true);
      assert.strictEqual(catalog["google/gemini-3-pro"].reasoningType, "level");
    });

    it("1.2 parses nested providers object format (models.dev API structure)", () => {
      const payload = {
        providers: {
          openai: {
            models: {
              "gpt-4o": {
                name: "GPT-4o",
                limit: { context: 128000, output: 4096 },
                attachment: true,
                modalities: { input: ["text", "image"] },
              },
            },
          },
        },
      };

      const catalog = parseModelsDevCatalog(payload);
      assert.ok(catalog["openai/gpt-4o"]);
      assert.ok(catalog["gpt-4o"]);
      assert.strictEqual(catalog["openai/gpt-4o"].contextLimit, 128000);
      assert.strictEqual(catalog["openai/gpt-4o"].outputLimit, 4096);
      assert.strictEqual(catalog["openai/gpt-4o"].hasVision, true);
      assert.strictEqual(catalog["openai/gpt-4o"].provider, "openai");
    });

    it("1.3 parses top-level provider map format", () => {
      const payload = {
        anthropic: {
          models: {
            "claude-3-5-sonnet": {
              name: "Claude 3.5 Sonnet",
              limit: { context: 200000, output: 8192 },
              modalities: { input: ["text", "image"] },
            },
          },
        },
      };

      const catalog = parseModelsDevCatalog(payload);
      assert.ok(catalog["anthropic/claude-3-5-sonnet"]);
      assert.strictEqual(
        catalog["anthropic/claude-3-5-sonnet"].contextLimit,
        200000,
      );
      assert.strictEqual(
        catalog["anthropic/claude-3-5-sonnet"].outputLimit,
        8192,
      );
      assert.strictEqual(
        catalog["anthropic/claude-3-5-sonnet"].hasVision,
        true,
      );
      assert.strictEqual(
        catalog["anthropic/claude-3-5-sonnet"].provider,
        "anthropic",
      );
    });

    it("1.4 handles malformed or empty payloads gracefully without throwing", () => {
      assert.deepStrictEqual(parseModelsDevCatalog(null), {});
      assert.deepStrictEqual(parseModelsDevCatalog(undefined), {});
      assert.deepStrictEqual(parseModelsDevCatalog(""), {});
      assert.deepStrictEqual(parseModelsDevCatalog(123), {});
      assert.deepStrictEqual(parseModelsDevCatalog([]), {});
    });

    it("1.5 safely defaults missing or negative limit fields to standard fallbacks (4096)", () => {
      const parsed = parseModelMetadataSafely({
        id: "test-model",
        contextLimit: -500,
        outputLimit: 0,
      });

      assert.strictEqual(parsed.contextLimit, 4096);
      assert.strictEqual(parsed.outputLimit, 4096);
      assert.strictEqual(parsed.hasVision, false);
      assert.strictEqual(parsed.hasReasoning, false);
      assert.strictEqual(parsed.hasTools, true);
      assert.strictEqual(parsed.supportsTemperature, true);
    });

    it("1.6 infers reasoning type correctly across Gemini 3, Gemini 2.5, and o-series models", () => {
      const gemini3Meta = parseModelMetadataSafely({
        id: "gemini-3-pro",
        hasReasoning: true,
      });
      assert.strictEqual(gemini3Meta.reasoningType, "level");

      const o3Meta = parseModelMetadataSafely({
        id: "o3-mini",
        reasoning: true,
      });
      assert.strictEqual(o3Meta.hasReasoning, true);
      assert.strictEqual(o3Meta.reasoningType, "level");

      const gemini25Meta = parseModelMetadataSafely({
        id: "gemini-2.5-flash",
        reasoning: true,
      });
      assert.strictEqual(gemini25Meta.hasReasoning, true);
      assert.strictEqual(gemini25Meta.reasoningType, "budget");
    });
  });

  // =========================================================================
  // Section 2: useModelStore Catalog Retrieval & Fallback Layers
  // =========================================================================
  describe("2. useModelStore Querying & Fallback Layers", () => {
    it("2.1 initializes with static snapshot fallback containing core models", () => {
      const store = useModelStore.getState();
      assert.ok(
        store.isLoaded(),
        "Store should be loaded from snapshot immediately",
      );

      const allModels = store.getAllModels();
      assert.ok(allModels.length > 0, "Snapshot should contain models");

      // Verify core providers exist
      const providers = new Set(allModels.map((m) => m.provider));
      assert.ok(
        providers.has("google") ||
          providers.has("openai") ||
          providers.has("anthropic"),
      );
    });

    it("2.2 matches models via exact ID, lowercase ID, and provider-prefixed ID", () => {
      const store = useModelStore.getState();

      const gpt4o = store.getModel("gpt-4o") || store.getModel("openai/gpt-4o");
      assert.ok(gpt4o, "Should resolve gpt-4o");

      const gpt4oUpper =
        store.getModel("GPT-4O") || store.getModel("OPENAI/GPT-4O");
      assert.ok(gpt4oUpper, "Should resolve case-insensitively");

      const gemini =
        store.getModel("gemini-3-pro") ||
        store.getModel("google/gemini-3-pro") ||
        store.getModel("gemini-2.5-pro");
      assert.ok(gemini, "Should resolve Gemini model");
    });

    it("2.3 safely returns undefined for unknown, null, undefined, or empty model IDs", () => {
      const store = useModelStore.getState();

      assert.strictEqual(
        store.getModel("nonexistent-model-xyz-12345"),
        undefined,
      );
      assert.strictEqual(store.getModel(""), undefined);
      assert.strictEqual(store.getModel(null as any), undefined);
      assert.strictEqual(store.getModel(undefined as any), undefined);
      assert.strictEqual(store.getModel(123 as any), undefined);
    });

    it("2.4 getProviderModels filters cleanly and deduplicates models", () => {
      const store = useModelStore.getState();

      const googleModels = store.getProviderModels("google");
      assert.ok(Array.isArray(googleModels));
      const seen = new Set<string>();
      for (const m of googleModels) {
        assert.ok(
          !seen.has(m.id),
          `Duplicate model ID in provider list: ${m.id}`,
        );
        seen.add(m.id);
      }

      assert.deepStrictEqual(store.getProviderModels(""), []);
      assert.deepStrictEqual(store.getProviderModels(null as any), []);
    });

    it("2.5 getAllModels returns deduplicated list of all available models", () => {
      const store = useModelStore.getState();
      const all = store.getAllModels();
      assert.ok(all.length > 0);

      const keys = new Set<string>();
      for (const m of all) {
        const key = `${m.provider}/${m.id}`;
        assert.ok(!keys.has(key), `Duplicate model key: ${key}`);
        keys.add(key);
      }
    });

    it("2.6 fetchModels falls back gracefully when network fails without clearing existing catalog", async () => {
      const store = useModelStore.getState();
      const initialCount = Object.keys(store.models).length;
      assert.ok(initialCount > 0);

      // Force fetch (in offline / mock environment, it falls back to snapshot)
      await store.fetchModels(true);
      const postCount = Object.keys(useModelStore.getState().models).length;
      assert.ok(postCount > 0, "Catalog should not be wiped on fetch");
    });
  });

  // =========================================================================
  // Section 3: Parameter Validation & Boundary Clamping
  // =========================================================================
  describe("3. Parameter Validation & Boundary Clamping", () => {
    it("3.1 clamps temperature to [0.0, 2.0] and handles extreme & invalid inputs", () => {
      assert.strictEqual(validateTemperatureValue(0.7), 0.7);
      assert.strictEqual(validateTemperatureValue(0.0), 0.0);
      assert.strictEqual(validateTemperatureValue(2.0), 2.0);
      assert.strictEqual(validateTemperatureValue(-100), 0.0);
      assert.strictEqual(validateTemperatureValue(999), 2.0);
      assert.strictEqual(validateTemperatureValue(NaN), 0.7);
      assert.strictEqual(validateTemperatureValue("invalid-string"), 0.7);
      assert.strictEqual(validateTemperatureValue(null), 0.0); // Number(null) === 0
      assert.strictEqual(validateTemperatureValue(undefined), 0.7); // Number(undefined) === NaN
    });

    it("3.2 isValidTemperature enforces strict numeric range [0.0, 2.0]", () => {
      assert.strictEqual(validateTemperature(0.0), true);
      assert.strictEqual(validateTemperature(1.0), true);
      assert.strictEqual(validateTemperature(2.0), true);
      assert.strictEqual(validateTemperature(-0.1), false);
      assert.strictEqual(validateTemperature(2.1), false);
      assert.strictEqual(validateTemperature("1.0" as any), false);
      assert.strictEqual(validateTemperature(NaN), false);
    });

    it("3.3 clamps top_p to [0.0, 1.0] with default fallback 1.0", () => {
      assert.strictEqual(validateTopP(0.5), 0.5);
      assert.strictEqual(validateTopP(0.0), 0.0);
      assert.strictEqual(validateTopP(1.0), 1.0);
      assert.strictEqual(validateTopP(-0.5), 0.0);
      assert.strictEqual(validateTopP(1.5), 1.0);
      assert.strictEqual(validateTopP(null), 1.0);
      assert.strictEqual(validateTopP(undefined), 1.0);
      assert.strictEqual(validateTopP(NaN), 1.0);
    });

    it("3.4 clamps max_tokens against model outputLimit and handles negative/invalid values", () => {
      // Valid within limit
      assert.strictEqual(validateMaxTokens(1000, 4096), 1000);
      // Exceeding model output limit
      assert.strictEqual(validateMaxTokens(10000, 4096), 4096);
      // Gemini 3 Pro high output limit (65536)
      assert.strictEqual(validateMaxTokens(50000, 65536), 50000);
      assert.strictEqual(validateMaxTokens(100000, 65536), 65536);
      // Negative or zero tokens fallback to min(2048, outputLimit)
      assert.strictEqual(validateMaxTokens(0, 4096), 2048);
      assert.strictEqual(validateMaxTokens(-500, 4096), 2048);
      assert.strictEqual(validateMaxTokens("invalid", 4096), 2048);
      assert.strictEqual(validateMaxTokens(0, 1024), 1024);
    });

    it("3.5 clamps max tokens and context limits using model catalog lookup", () => {
      const mockCatalog: Record<string, any> = {
        "gpt-4o": {
          id: "gpt-4o",
          outputLimit: 4096,
          contextLimit: 128000,
          hasVision: true,
        },
        "gemini-3-pro": {
          id: "gemini-3-pro",
          outputLimit: 65536,
          contextLimit: 2097152,
          hasVision: true,
        },
      };

      assert.strictEqual(clampMaxTokens("gpt-4o", 8000, mockCatalog), 4096);
      assert.strictEqual(
        clampMaxTokens("gemini-3-pro", 50000, mockCatalog),
        50000,
      );
      assert.strictEqual(
        clampMaxTokens("unknown-model", 8000, mockCatalog),
        4096,
      ); // default limit

      assert.strictEqual(
        clampContextLimit("gpt-4o", 200000, mockCatalog),
        128000,
      );
      assert.strictEqual(
        clampContextLimit("gemini-3-pro", 1000000, mockCatalog),
        1000000,
      );
      assert.strictEqual(
        clampContextLimit("unknown-model", 10000, mockCatalog),
        4096,
      ); // default limit
    });

    it("3.6 searchModels performs safe, regex-injection-free keyword matching", () => {
      const modelList = [
        "google/gemini-3-pro",
        "google/gemini-3-flash",
        "openai/gpt-4o",
        "openai/o3-mini",
        "anthropic/claude-3-5-sonnet",
      ];

      // Normal query
      assert.deepStrictEqual(searchModels("gemini", modelList), [
        "google/gemini-3-pro",
        "google/gemini-3-flash",
      ]);

      // Regex special characters do not throw or match regex wildcards
      assert.deepStrictEqual(searchModels(".*", modelList), []);
      assert.deepStrictEqual(searchModels("(", modelList), []);
      assert.deepStrictEqual(searchModels("[", modelList), []);
      assert.deepStrictEqual(searchModels("+", modelList), []);

      // Empty or whitespace query returns full list
      assert.deepStrictEqual(searchModels("", modelList), modelList);
      assert.deepStrictEqual(searchModels("   ", modelList), modelList);
    });
  });

  // =========================================================================
  // Section 4: Vision Capability Gating & UI Adaptation Verification
  // =========================================================================
  describe("4. Vision Gating & UI Adaptation Verification", () => {
    it("4.1 isImageUploadAllowed correctly reflects hasVision capability for vision vs non-vision models", () => {
      useModelStore.getState().setModels({
        "openai/gpt-4o": {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          contextLimit: 128000,
          outputLimit: 4096,
          hasVision: true,
          hasReasoning: false,
          hasTools: true,
        },
        "google/gemini-3-pro": {
          id: "gemini-3-pro",
          name: "Gemini 3 Pro",
          provider: "google",
          contextLimit: 2097152,
          outputLimit: 65536,
          hasVision: true,
          hasReasoning: true,
          hasTools: true,
        },
        "openai/o3-mini": {
          id: "o3-mini",
          name: "o3-mini",
          provider: "openai",
          contextLimit: 200000,
          outputLimit: 100000,
          hasVision: false,
          hasReasoning: true,
          hasTools: true,
        },
        "openai/text-embedding-3-small": {
          id: "text-embedding-3-small",
          name: "Text Embedding 3 Small",
          provider: "openai",
          contextLimit: 8191,
          outputLimit: 512,
          hasVision: false,
          hasReasoning: false,
          hasTools: false,
        },
      });

      assert.strictEqual(isImageUploadAllowed("gpt-4o"), true);
      assert.strictEqual(isImageUploadAllowed("gemini-3-pro"), true);
      assert.strictEqual(isImageUploadAllowed("o3-mini"), false);
      assert.strictEqual(isImageUploadAllowed("text-embedding-3-small"), false);
      assert.strictEqual(isImageUploadAllowed("unknown-custom-model"), false);
    });

    it("4.2 isReasoningConfigEnabled matches model metadata hasReasoning flag", () => {
      assert.strictEqual(isReasoningConfigEnabled("gemini-3-pro"), true);
      assert.strictEqual(isReasoningConfigEnabled("o3-mini"), true);
      assert.strictEqual(isReasoningConfigEnabled("gpt-4o"), false);
      assert.strictEqual(
        isReasoningConfigEnabled("text-embedding-3-small"),
        false,
      );
      assert.strictEqual(isReasoningConfigEnabled("non-existent-model"), false);
    });

    it("4.3 ModelSelector component exists and integrates store capabilities", () => {
      const modelSelectorPath = path.join(
        rootDir,
        "src/components/chat/model-selector.tsx",
      );
      assert.ok(
        fs.existsSync(modelSelectorPath),
        "model-selector.tsx must exist",
      );
      const content = fs.readFileSync(modelSelectorPath, "utf-8");
      assert.ok(
        content.includes("export function ModelSelector"),
        "Must export ModelSelector",
      );
      assert.ok(content.includes("useModelStore"), "Must use useModelStore");
      assert.ok(
        content.includes("hasVision"),
        "Must display Vision capability",
      );
      assert.ok(
        content.includes("hasReasoning"),
        "Must display Reasoning capability",
      );
      assert.ok(content.includes("hasTools"), "Must display Tools capability");
    });

    it("4.4 Chat component dynamically gates image upload action using vision checks", () => {
      const chatComponentPath = path.join(rootDir, "src/components/chat.tsx");
      assert.ok(fs.existsSync(chatComponentPath), "chat.tsx must exist");
      const content = fs.readFileSync(chatComponentPath, "utf-8");
      assert.ok(
        content.includes("isVisionModel(currentModel)"),
        "chat.tsx must check isVisionModel",
      );
      assert.ok(
        content.includes("showUploadImage"),
        "chat.tsx must conditionally toggle showUploadImage",
      );
      assert.ok(
        content.includes("setAttachImages([])"),
        "chat.tsx must reset attachments when switching to non-vision model",
      );
    });
  });
});

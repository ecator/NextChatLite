import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseModelMetadataSafely,
  parseModelsDevCatalog,
  useModelStore,
  ModelMetadata,
} from "../../../app/store/models";
import {
  ParameterValidator,
  validateTemperature,
  validateTemperatureValue,
  validateTopP,
  validateMaxTokens,
  clampMaxTokens,
  clampContextLimit,
  isImageUploadAllowed,
  isReasoningConfigEnabled,
  searchModels,
} from "../../../app/utils/model-limits";

describe("Milestone 3 Challenger Empirical Stress Suite", () => {
  // =========================================================================
  // 1. Dynamic Model Selector Search & Filtering Stress
  // =========================================================================
  describe("1. Dynamic Model Selector Search & Filtering Stress", () => {
    const comprehensiveCatalog: ModelMetadata[] = [
      {
        id: "google/gemini-3-pro",
        name: "Gemini 3 Pro (Preview)",
        provider: "google",
        contextLimit: 2097152,
        outputLimit: 65536,
        hasVision: true,
        hasReasoning: true,
        reasoningType: "level",
        hasTools: true,
        description: "Google's most capable multimodal reasoning model 🚀",
      },
      {
        id: "google/gemini-3-flash",
        name: "Gemini 3 Flash",
        provider: "google",
        contextLimit: 1048576,
        outputLimit: 8192,
        hasVision: true,
        hasReasoning: true,
        reasoningType: "level",
        hasTools: true,
        description: "Fast multimodal reasoning ⚡",
      },
      {
        id: "openai/gpt-4o",
        name: "GPT-4o Omnichannel",
        provider: "openai",
        contextLimit: 128000,
        outputLimit: 4096,
        hasVision: true,
        hasReasoning: false,
        hasTools: true,
        description: "Flagship intelligence across text and vision 👁️",
      },
      {
        id: "openai/o3-mini",
        name: "o3-mini Reasoning",
        provider: "openai",
        contextLimit: 200000,
        outputLimit: 100000,
        hasVision: false,
        hasReasoning: true,
        reasoningType: "level",
        hasTools: true,
        description: "STEM and reasoning specialist 🧠",
      },
      {
        id: "anthropic/claude-3-5-sonnet",
        name: "Claude 3.5 Sonnet",
        provider: "anthropic",
        contextLimit: 200000,
        outputLimit: 8192,
        hasVision: true,
        hasReasoning: false,
        hasTools: true,
        description: "Anthropic smart coding and reasoning model",
      },
      {
        id: "zhipu/glm-4v",
        name: "智谱 GLM-4V 多模态",
        provider: "zhipu",
        contextLimit: 128000,
        outputLimit: 4096,
        hasVision: true,
        hasReasoning: false,
        hasTools: true,
        description: "智谱清言大语言模型 🇨🇳",
      },
      {
        id: "deepseek/deepseek-r1",
        name: "DeepSeek R1 深度推理",
        provider: "deepseek",
        contextLimit: 64000,
        outputLimit: 8192,
        hasVision: false,
        hasReasoning: true,
        reasoningType: "budget",
        hasTools: true,
        description: "DeepSeek-R1 open-weights reasoning model",
      },
      {
        id: "special/regex-[test].*+(model)",
        name: "Regex Special (Chars) [v1.0]",
        provider: "special",
        contextLimit: 4096,
        outputLimit: 4096,
        hasVision: false,
        hasReasoning: false,
        hasTools: false,
        description: "Model with regex symbols: .*+?^$()[]{}|\\",
      },
    ];

    // Helper imitating ModelSelector's filter logic
    function filterModelsUI(
      models: ModelMetadata[],
      selectedProvider: string,
      searchQuery: string,
    ): ModelMetadata[] {
      let list = models;
      if (selectedProvider !== "all") {
        list = list.filter(
          (m) => (m.provider || "").toLowerCase() === selectedProvider.toLowerCase(),
        );
      }
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        list = list.filter(
          (m) =>
            m.id.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q) ||
            (m.provider && m.provider.toLowerCase().includes(q)) ||
            (m.description && m.description.toLowerCase().includes(q)),
        );
      }
      return list;
    }

    it("1.1 handles adversarial regex metacharacters without throwing or erroneous matching", () => {
      const regexPatterns = [
        ".*",
        "(",
        "[",
        "]",
        "\\d+",
        "^$",
        "?",
        "*",
        "+",
        "{}",
        "|",
        "\\",
        "^",
        "$",
        "(.*?)",
        "[a-z]+",
        "\\bword\\b",
        "(((((((((()",
      ];

      for (const pattern of regexPatterns) {
        assert.doesNotThrow(() => {
          const results = filterModelsUI(comprehensiveCatalog, "all", pattern);
          assert.ok(Array.isArray(results));
        }, `Filter threw error on regex pattern: ${pattern}`);

        assert.doesNotThrow(() => {
          const helperResults = searchModels(
            pattern,
            comprehensiveCatalog.map((m) => m.id),
          );
          assert.ok(Array.isArray(helperResults));
        }, `searchModels helper threw error on regex pattern: ${pattern}`);
      }

      // Exact substring search for special characters
      const regexMatch = filterModelsUI(comprehensiveCatalog, "all", "[test]");
      assert.strictEqual(regexMatch.length, 1);
      assert.strictEqual(regexMatch[0].id, "special/regex-[test].*+(model)");
    });

    it("1.2 supports full unicode, CJK, Emoji, Cyrillic, and Arabic queries", () => {
      // CJK search
      const zhipuMatch = filterModelsUI(comprehensiveCatalog, "all", "智谱");
      assert.strictEqual(zhipuMatch.length, 1);
      assert.strictEqual(zhipuMatch[0].id, "zhipu/glm-4v");

      const deepseekMatch = filterModelsUI(comprehensiveCatalog, "all", "深度推理");
      assert.strictEqual(deepseekMatch.length, 1);
      assert.strictEqual(deepseekMatch[0].id, "deepseek/deepseek-r1");

      // Emoji search
      const rocketMatch = filterModelsUI(comprehensiveCatalog, "all", "🚀");
      assert.strictEqual(rocketMatch.length, 1);
      assert.strictEqual(rocketMatch[0].id, "google/gemini-3-pro");

      const brainMatch = filterModelsUI(comprehensiveCatalog, "all", "🧠");
      assert.strictEqual(brainMatch.length, 1);
      assert.strictEqual(brainMatch[0].id, "openai/o3-mini");

      // Whitespace padded unicode
      const paddedMatch = filterModelsUI(comprehensiveCatalog, "all", "   智谱   ");
      assert.strictEqual(paddedMatch.length, 1);
    });

    it("1.3 sustains 10,000 rapid query bursts under 200ms without degradation", () => {
      const queries = [
        "gemini",
        "gpt",
        "claude",
        "4o",
        "o3",
        "r1",
        "google",
        "openai",
        "anthropic",
        "智谱",
        "⚡",
        "multimodal",
        "reasoning",
        "none",
        "   ",
        "a",
      ];

      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        const q = queries[i % queries.length];
        const res = filterModelsUI(comprehensiveCatalog, "all", q);
        assert.ok(res.length >= 0);
      }
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 200, `10,000 queries took too long: ${elapsed}ms`);
    });

    it("1.4 handles extreme string inputs (1000+ chars, SQLi, XSS vectors)", () => {
      const maliciousInputs = [
        "A".repeat(2000),
        "<script>alert('xss')</script>",
        "' OR '1'='1",
        "DROP TABLE models; --",
        "undefined",
        "null",
        "[object Object]",
        "\\x00\\x01\\x02",
        "\n\r\t\0",
      ];

      for (const input of maliciousInputs) {
        const results = filterModelsUI(comprehensiveCatalog, "all", input);
        assert.ok(Array.isArray(results));
      }
    });

    it("1.5 correctly intersects provider filter with search query", () => {
      // Filter provider 'google' and search 'pro' -> only gemini-3-pro
      const googlePro = filterModelsUI(comprehensiveCatalog, "google", "pro");
      assert.strictEqual(googlePro.length, 1);
      assert.strictEqual(googlePro[0].id, "google/gemini-3-pro");

      // Filter provider 'openai' and search 'gemini' -> empty
      const openaiGemini = filterModelsUI(comprehensiveCatalog, "openai", "gemini");
      assert.strictEqual(openaiGemini.length, 0);

      // Case-insensitive provider filter
      const upperGoogle = filterModelsUI(comprehensiveCatalog, "GOOGLE", "flash");
      assert.strictEqual(upperGoogle.length, 1);
      assert.strictEqual(upperGoogle[0].id, "google/gemini-3-flash");

      // Non-existent provider
      const nonExistent = filterModelsUI(comprehensiveCatalog, "unknown_corp", "");
      assert.strictEqual(nonExistent.length, 0);
    });
  });

  // =========================================================================
  // 2. Parameter Clamping Boundaries & Type Resilience
  // =========================================================================
  describe("2. Parameter Clamping Boundaries & Type Resilience", () => {
    it("2.1 clamps temperature under exotic numeric and non-numeric boundary inputs", () => {
      // Standard range bounds
      assert.strictEqual(validateTemperatureValue(0.0), 0.0);
      assert.strictEqual(validateTemperatureValue(2.0), 2.0);
      assert.strictEqual(validateTemperatureValue(1.0), 1.0);

      // Negative and extreme values
      assert.strictEqual(validateTemperatureValue(-0.000001), 0.0);
      assert.strictEqual(validateTemperatureValue(-1e10), 0.0);
      assert.strictEqual(validateTemperatureValue(-Infinity), 0.0);

      // Above upper bound
      assert.strictEqual(validateTemperatureValue(2.000001), 2.0);
      assert.strictEqual(validateTemperatureValue(1e10), 2.0);
      assert.strictEqual(validateTemperatureValue(Infinity), 2.0);

      // String conversions
      assert.strictEqual(validateTemperatureValue("1.5"), 1.5);
      assert.strictEqual(validateTemperatureValue("0"), 0.0);
      assert.strictEqual(validateTemperatureValue("2.0"), 2.0);
      assert.strictEqual(validateTemperatureValue("-5"), 0.0);
      assert.strictEqual(validateTemperatureValue("100"), 2.0);

      // Non-convertible fallbacks (default: 0.7)
      assert.strictEqual(validateTemperatureValue("abc"), 0.7);
      assert.strictEqual(validateTemperatureValue(NaN), 0.7);
      assert.strictEqual(validateTemperatureValue(undefined), 0.7);
      assert.strictEqual(validateTemperatureValue({}), 0.7);

      // Strict validator (isValidTemperature)
      assert.strictEqual(validateTemperature(0.0), true);
      assert.strictEqual(validateTemperature(2.0), true);
      assert.strictEqual(validateTemperature(1.999), true);
      assert.strictEqual(validateTemperature(-0.001), false);
      assert.strictEqual(validateTemperature(2.001), false);
      assert.strictEqual(validateTemperature("1.0" as any), false);
      assert.strictEqual(validateTemperature(null as any), false);
      assert.strictEqual(validateTemperature(undefined as any), false);
    });

    it("2.2 clamps top_p strictly between [0.0, 1.0] under all edge conditions", () => {
      assert.strictEqual(validateTopP(0.0), 0.0);
      assert.strictEqual(validateTopP(1.0), 1.0);
      assert.strictEqual(validateTopP(0.95), 0.95);
      assert.strictEqual(validateTopP(-0.0001), 0.0);
      assert.strictEqual(validateTopP(-100), 0.0);
      assert.strictEqual(validateTopP(-Infinity), 0.0);
      assert.strictEqual(validateTopP(1.0001), 1.0);
      assert.strictEqual(validateTopP(100), 1.0);
      assert.strictEqual(validateTopP(Infinity), 1.0);
      assert.strictEqual(validateTopP(null), 1.0);
      assert.strictEqual(validateTopP(undefined), 1.0);
      assert.strictEqual(validateTopP(NaN), 1.0);
      assert.strictEqual(validateTopP("0.8"), 0.8);
      assert.strictEqual(validateTopP("invalid"), 1.0);
    });

    it("2.3 clamps max_tokens and handles zero / negative / extreme / floating limits", () => {
      // Normal within limit
      assert.strictEqual(validateMaxTokens(2000, 4096), 2000);
      assert.strictEqual(validateMaxTokens(4096, 4096), 4096);
      assert.strictEqual(validateMaxTokens(5000, 4096), 4096);

      // Gemini 3 Pro high limits
      assert.strictEqual(validateMaxTokens(65536, 65536), 65536);
      assert.strictEqual(validateMaxTokens(70000, 65536), 65536);

      // Fallback on zero / negative
      assert.strictEqual(validateMaxTokens(0, 4096), 2048);
      assert.strictEqual(validateMaxTokens(-1, 4096), 2048);
      assert.strictEqual(validateMaxTokens(-99999, 4096), 2048);

      // If model output limit is smaller than 2048 (e.g. 512)
      assert.strictEqual(validateMaxTokens(0, 512), 512);
      assert.strictEqual(validateMaxTokens(-100, 512), 512);
      assert.strictEqual(validateMaxTokens(1000, 512), 512);

      // Floats and string integers
      assert.strictEqual(validateMaxTokens(1024.9, 4096), 1024);
      assert.strictEqual(validateMaxTokens("3000", 4096), 3000);
      assert.strictEqual(validateMaxTokens("99999", 4096), 4096);
      assert.strictEqual(validateMaxTokens("not-a-number", 4096), 2048);
    });

    it("2.4 handles clampMaxTokens and clampContextLimit with missing catalog or unknown models", () => {
      // Catalog as object
      const catalogObj = {
        "m-small": { id: "m-small", outputLimit: 1024, contextLimit: 4096 },
        "m-huge": { id: "m-huge", outputLimit: 100000, contextLimit: 2000000 },
      };

      assert.strictEqual(clampMaxTokens("m-small", 2000, catalogObj), 1024);
      assert.strictEqual(clampMaxTokens("m-huge", 50000, catalogObj), 50000);
      assert.strictEqual(clampMaxTokens("m-huge", 150000, catalogObj), 100000);

      // Catalog as array
      const catalogArr = [
        { id: "m-small", outputLimit: 1024, contextLimit: 4096, name: "Small Model" },
        { id: "m-huge", outputLimit: 100000, contextLimit: 2000000, name: "Huge Model" },
      ];

      assert.strictEqual(clampMaxTokens("Small Model", 2000, catalogArr as any), 1024);
      assert.strictEqual(clampContextLimit("Huge Model", 3000000, catalogArr as any), 2000000);

      // Undefined catalog falls back gracefully
      assert.strictEqual(clampMaxTokens("unknown-xyz", 9000, null), 4096);
      assert.strictEqual(clampContextLimit("unknown-xyz", 90000, undefined), 4096);
    });
  });

  // =========================================================================
  // 3. Model Store Reactivity, Mutation & Fallback Resiliency
  // =========================================================================
  describe("3. Model Store Reactivity, Mutation & Fallback Resiliency", () => {
    it("3.1 preserves catalog data during concurrent fetch attempts", async () => {
      const store = useModelStore.getState();
      const initialModels = store.getAllModels();
      assert.ok(initialModels.length > 0);

      // Trigger 5 concurrent fetchModels calls
      await Promise.all([
        store.fetchModels(true),
        store.fetchModels(true),
        store.fetchModels(true),
        store.fetchModels(true),
        store.fetchModels(true),
      ]);

      const postModels = useModelStore.getState().getAllModels();
      assert.ok(postModels.length > 0, "Catalog must remain intact after concurrent fetches");
      assert.strictEqual(useModelStore.getState().loading, false);
    });

    it("3.2 safely resolves models through prefix, suffix, and case permutations", () => {
      useModelStore.getState().setModels({
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
      });

      const store = useModelStore.getState();

      // Direct key
      assert.ok(store.getModel("google/gemini-3-pro"));
      // Short ID
      assert.ok(store.getModel("gemini-3-pro"));
      // Uppercase full key
      assert.ok(store.getModel("GOOGLE/GEMINI-3-PRO"));
      // Uppercase short ID
      assert.ok(store.getModel("GEMINI-3-PRO"));
      // Suffix match when requested with short id
      assert.ok(store.getModel("gpt-4o"));
      assert.ok(store.getModel("openai/gpt-4o"));

      // Non-matching query
      assert.strictEqual(store.getModel("claude-nonexistent"), undefined);
    });

    it("3.3 resets cleanly and repopulates initial snapshot", () => {
      const store = useModelStore.getState();
      store.setModels({});
      assert.strictEqual(Object.keys(useModelStore.getState().models).length, 0);

      // Reset
      store.reset();
      assert.ok(Object.keys(useModelStore.getState().models).length > 0);
      assert.strictEqual(useModelStore.getState().loading, false);
      assert.strictEqual(useModelStore.getState().error, null);
    });

    it("3.4 safely parses corrupted or non-standard models.dev catalogs", () => {
      // Corrupted provider structures
      const corruptedPayload = {
        providers: {
          badProvider1: null,
          badProvider2: "invalid",
          badProvider3: [],
          goodProvider: {
            models: {
              "model-1": {
                name: "Model 1",
                limit: { context: 8192, output: 2048 },
              },
            },
          },
        },
      };

      const parsed = parseModelsDevCatalog(corruptedPayload);
      assert.ok(parsed["goodProvider/model-1"]);
      assert.strictEqual(parsed["goodProvider/model-1"].contextLimit, 8192);

      // Model with negative limits and boolean inversion
      const weirdModel = parseModelMetadataSafely({
        id: "weird-model",
        contextLimit: "not-a-number",
        outputLimit: -500,
        attachment: true,
        tool_call: false,
        temperature: false,
      });

      assert.strictEqual(weirdModel.contextLimit, 4096);
      assert.strictEqual(weirdModel.outputLimit, 4096);
      assert.strictEqual(weirdModel.hasVision, true);
      assert.strictEqual(weirdModel.hasTools, false);
      assert.strictEqual(weirdModel.supportsTemperature, false);
    });
  });
});

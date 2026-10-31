import {
  parseModelsDevCatalog,
  parseModelMetadataSafely,
  useModelStore,
} from "../app/store/models";
import {
  ParameterValidator,
  validateTemperature,
  clampMaxTokens,
  clampContextLimit,
  isImageUploadAllowed,
  isReasoningConfigEnabled,
  searchModels,
} from "../app/utils/model-limits";

describe("Dynamic Model Metadata Catalog (models.dev)", () => {
  const mockFixture = {
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
      "google/gemini-2.5-pro": {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        provider: "google",
        contextLimit: 2097152,
        outputLimit: 8192,
        hasVision: true,
        hasReasoning: true,
        reasoningType: "budget",
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
      "openai/o3-mini": {
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        contextLimit: 200000,
        outputLimit: 100000,
        hasVision: false,
        hasReasoning: true,
        reasoningType: "level",
        hasTools: true,
      },
    },
  };

  it("parses models catalog and extracts limits accurately", () => {
    const catalog = parseModelsDevCatalog(mockFixture);
    expect(Object.keys(catalog).length).toBeGreaterThanOrEqual(4);

    const gemini3 = catalog["google/gemini-3-pro"];
    expect(gemini3.contextLimit).toBe(2097152);
    expect(gemini3.outputLimit).toBe(65536);
    expect(gemini3.hasVision).toBe(true);
    expect(gemini3.hasReasoning).toBe(true);
    expect(gemini3.reasoningType).toBe("level");

    const gemini25 = catalog["google/gemini-2.5-pro"];
    expect(gemini25.reasoningType).toBe("budget");

    const gpt4o = catalog["openai/gpt-4o"];
    expect(gpt4o.hasReasoning).toBe(false);
    expect(gpt4o.outputLimit).toBe(4096);
  });

  it("handles malformed or boundary model metadata safely", () => {
    const safeEmpty = parseModelMetadataSafely({});
    expect(safeEmpty.id).toBe("unknown-model");
    expect(safeEmpty.contextLimit).toBe(4096);
    expect(safeEmpty.outputLimit).toBe(4096);
    expect(safeEmpty.hasVision).toBe(false);
    expect(safeEmpty.hasReasoning).toBe(false);

    const safeZero = parseModelMetadataSafely({ contextLimit: 0, outputLimit: -100 });
    expect(safeZero.contextLimit).toBe(4096);
    expect(safeZero.outputLimit).toBe(4096);

    const safeNull = parseModelMetadataSafely(null);
    expect(safeNull.id).toBe("unknown-model");
  });

  it("validates and bounds parameters via ParameterValidator", () => {
    expect(ParameterValidator.validateTemperature(0.0)).toBe(0.0);
    expect(ParameterValidator.validateTemperature(2.0)).toBe(2.0);
    expect(ParameterValidator.validateTemperature(-0.5)).toBe(0.0);
    expect(ParameterValidator.validateTemperature(3.5)).toBe(2.0);
    expect(ParameterValidator.validateTemperature("invalid")).toBe(0.7);

    expect(ParameterValidator.validateTopP(0.0)).toBe(0.0);
    expect(ParameterValidator.validateTopP(1.0)).toBe(1.0);
    expect(ParameterValidator.validateTopP(-0.1)).toBe(0.0);
    expect(ParameterValidator.validateTopP(1.5)).toBe(1.0);
    expect(ParameterValidator.validateTopP(null)).toBe(1.0);

    expect(ParameterValidator.validateMaxTokens(1000, 4096)).toBe(1000);
    expect(ParameterValidator.validateMaxTokens(8000, 4096)).toBe(4096);
    expect(ParameterValidator.validateMaxTokens(0, 4096)).toBe(2048);
    expect(ParameterValidator.validateMaxTokens(-50, 4096)).toBe(2048);

    expect(validateTemperature(0.7)).toBe(true);
    expect(validateTemperature(-0.1)).toBe(false);
    expect(validateTemperature(2.5)).toBe(false);
  });

  it("filters search keywords accurately", () => {
    const list = ["gpt-4o", "gemini-3-pro", "gemini-3-flash", "o3-mini", "claude-3-5-sonnet"];
    expect(searchModels("gemini", list)).toEqual(["gemini-3-pro", "gemini-3-flash"]);
    expect(searchModels("3-", list)).toEqual(["gemini-3-pro", "gemini-3-flash", "o3-mini", "claude-3-5-sonnet"]);
    expect(searchModels(".*", list)).toEqual([]);
    expect(searchModels("", list)).toEqual(list);
  });

  it("evaluates vision, reasoning, and token clamping against catalog", () => {
    const catalog = parseModelsDevCatalog(mockFixture);
    expect(isImageUploadAllowed("gpt-4o", catalog)).toBe(true);
    expect(isImageUploadAllowed("gemini-3-pro", catalog)).toBe(true);
    expect(isImageUploadAllowed("o3-mini", catalog)).toBe(false);

    expect(isReasoningConfigEnabled("gemini-3-pro", catalog)).toBe(true);
    expect(isReasoningConfigEnabled("o3-mini", catalog)).toBe(true);
    expect(isReasoningConfigEnabled("gpt-4o", catalog)).toBe(false);

    expect(clampMaxTokens("gpt-4o", 10000, catalog)).toBe(4096);
    expect(clampMaxTokens("gemini-3-pro", 50000, catalog)).toBe(50000);
    expect(clampMaxTokens("gemini-3-pro", 100000, catalog)).toBe(65536);

    expect(clampContextLimit("gpt-4o", 50000, catalog)).toBe(50000);
    expect(clampContextLimit("gpt-4o", 200000, catalog)).toBe(128000);
  });

  it("useModelStore exposes query and status methods", () => {
    const store = useModelStore.getState();
    expect(typeof store.fetchModels).toBe("function");
    expect(typeof store.getModel).toBe("function");
    expect(typeof store.getProviderModels).toBe("function");
    expect(typeof store.getAllModels).toBe("function");
    expect(typeof store.isLoaded).toBe("function");

    const all = store.getAllModels();
    expect(all.length).toBeGreaterThan(0);
    expect(store.isLoaded()).toBe(true);

    const gemini = store.getModel("gemini-2.5-pro") || store.getModel("google/gemini-2.5-pro");
    expect(gemini).toBeDefined();
    expect(gemini?.provider.toLowerCase()).toBe("google");
  });
});

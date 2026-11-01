import {
  useModelStore,
  isModelInProvidersJson,
  resolveDefaultModel,
  validateModelOrFallback,
} from "@/store/models";
import { useChatStore } from "@/store/chat";
import { useMaskStore, createEmptyMask } from "@/store/mask";
import { useAccessStore, useAppConfig } from "@/store";
import defaultProvidersJson from "@/../public/providers.json";

describe("Frontend providers.json restriction and DEFAULT_MODEL fallback", () => {
  beforeEach(() => {
    useModelStore.getState().reset();
    useChatStore.getState().clearSessions();
    useAccessStore.setState({ defaultModel: "" });
  });

  test("useModelStore.getAllModels() only returns models defined in /providers.json", () => {
    const allModels = useModelStore.getState().getAllModels();
    expect(allModels.length).toBeGreaterThanOrEqual(4);

    // Verify all returned models exist in public/providers.json
    const expectedIds = new Set<string>();
    defaultProvidersJson.forEach((provider: any) => {
      Object.keys(provider.models || {}).forEach((mId) => {
        expectedIds.add(mId.toLowerCase());
        expectedIds.add(`${provider.id}/${mId}`.toLowerCase());
      });
    });

    for (const model of allModels) {
      expect(
        expectedIds.has(model.id.toLowerCase()) ||
          expectedIds.has(`${model.provider}/${model.id}`.toLowerCase()),
      ).toBe(true);
    }

    // Must NOT contain snapshot models like claude-3-5-sonnet, gpt-4, gpt-3.5-turbo
    const modelIds = allModels.map((m) => m.id.toLowerCase());
    expect(modelIds).not.toContain("gpt-4");
    expect(modelIds).not.toContain("gpt-3.5-turbo");
    expect(modelIds).not.toContain("claude-3-5-sonnet");
  });

  test("isModelInProvidersJson accurately verifies models", () => {
    // Models in providers.json
    expect(isModelInProvidersJson("gemini-3.5-flash")).toBe(true);
    expect(isModelInProvidersJson("google/gemini-3.5-flash")).toBe(true);
    expect(isModelInProvidersJson("gemini-3.5-flash@Google")).toBe(true);
    expect(isModelInProvidersJson("gemini-3.1-flash-lite")).toBe(true);
    expect(isModelInProvidersJson("gpt-5-mini")).toBe(true);
    expect(isModelInProvidersJson("openai/gpt-5-mini")).toBe(true);

    // Models NOT in providers.json
    expect(isModelInProvidersJson("gpt-4")).toBe(false);
    expect(isModelInProvidersJson("gpt-3.5-turbo")).toBe(false);
    expect(isModelInProvidersJson("gpt-4o")).toBe(false);
    expect(isModelInProvidersJson("claude-3-5-sonnet")).toBe(false);
    expect(isModelInProvidersJson("")).toBe(false);
  });

  test("resolveDefaultModel resolves first model in /providers.json when no defaultModel is set", () => {
    useAccessStore.setState({ defaultModel: "" });
    const def = resolveDefaultModel();
    expect(def.model).toBe("gemini-3.5-flash");
    expect(def.providerName.toLowerCase()).toContain("google");
  });

  test("resolveDefaultModel respects valid accessStore.defaultModel", () => {
    useAccessStore.setState({ defaultModel: "openai/gpt-5.1" });
    const def = resolveDefaultModel();
    expect(def.model).toBe("gpt-5.1");
    expect(def.providerName.toLowerCase()).toContain("openai");
  });

  test("validateModelOrFallback falls back to DEFAULT_MODEL for unknown models", () => {
    useAccessStore.setState({ defaultModel: "" });
    const fallback = validateModelOrFallback("gpt-4", "OpenAI");
    expect(fallback.model).toBe("gemini-3.5-flash");

    // When configured with custom defaultModel
    useAccessStore.setState({ defaultModel: "gpt-5-mini" });
    const customFallback = validateModelOrFallback(
      "nonexistent-model",
      "Custom",
    );
    expect(customFallback.model).toBe("gpt-5-mini");
  });

  test("creating session from mask with nonexistent model uses DEFAULT_MODEL", () => {
    useAccessStore.setState({ defaultModel: "openai/gpt-5-mini" });

    const mask = createEmptyMask();
    mask.name = "Test Legacy Mask";
    mask.modelConfig.model = "gpt-3.5-turbo" as any;
    mask.modelConfig.providerName = "OpenAI" as any;

    const chatStore = useChatStore.getState();
    chatStore.newSession(mask);

    const session = chatStore.currentSession();
    expect(session.topic).toBe("Test Legacy Mask");
    // Model must be replaced by DEFAULT_MODEL (gpt-5-mini)
    expect(session.mask.modelConfig.model).toBe("gpt-5-mini");
  });

  test("builtin mask store sanitizes models not in /providers.json to DEFAULT_MODEL", async () => {
    const maskStore = useMaskStore.getState();
    const created = maskStore.create({
      name: "Custom Nonexistent Model Mask",
      modelConfig: {
        ...useAppConfig.getState().modelConfig,
        model: "gpt-4" as any,
      },
    });

    expect(created.modelConfig.model).not.toBe("gpt-4");
    expect(isModelInProvidersJson(created.modelConfig.model)).toBe(true);
  });
});

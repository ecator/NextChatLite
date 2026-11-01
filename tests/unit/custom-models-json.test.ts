import { parseModelsDevCatalog, useModelStore } from "@/store/models";
import { createLanguageModel } from "@/app/api/chat/route";
import { isVisionModel, showPlugins } from "@/utils";
import defaultModelsJson from "@/../public/providers.json";
import { ServiceProvider } from "@/constant";
import { streamText } from "ai";

describe("Custom models.json Catalog and Backend Integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("parses array format in public/models.json with env, npm, api, and modalities", () => {
    const catalog = parseModelsDevCatalog(defaultModelsJson);
    expect(Object.keys(catalog).length).toBeGreaterThanOrEqual(4);

    // Google Provider Models
    const geminiFlash =
      catalog["google/gemini-3.5-flash"] || catalog["gemini-3.5-flash"];
    expect(geminiFlash).toBeDefined();
    expect(geminiFlash.provider).toBe("google");
    expect(geminiFlash.npm).toBe("@ai-sdk/google");
    expect(geminiFlash.env).toContain("GOOGLE_API_KEY");
    expect(geminiFlash.tool_call).toBe(true);
    expect(geminiFlash.hasTools).toBe(true);
    expect(geminiFlash.hasVision).toBe(true);
    expect(geminiFlash.modalities?.input).toContain("image");
    expect(geminiFlash.modalities?.input).toContain("pdf");

    // OpenAI Compatible Provider Models
    const gpt5Mini = catalog["openai/gpt-5-mini"] || catalog["gpt-5-mini"];
    expect(gpt5Mini).toBeDefined();
    expect(gpt5Mini.provider).toBe("openai");
    expect(gpt5Mini.npm).toBe("@ai-sdk/openai-compatible");
    expect(gpt5Mini.api).toBe("http://127.0.0.1:11434/v1");
    expect(gpt5Mini.env).toContain("OPENAI_API_KEY");
    expect(gpt5Mini.tool_call).toBe(true);
    expect(gpt5Mini.hasTools).toBe(true);
    expect(gpt5Mini.hasVision).toBe(true);
  });

  it("judges tool calling and attachment capabilities from tool_call and modalities", () => {
    const customJson = [
      {
        id: "test-provider",
        name: "Test Provider",
        env: ["TEST_API_KEY"],
        npm: "@ai-sdk/openai-compatible",
        models: {
          "text-only-no-tools": {
            id: "text-only-no-tools",
            name: "Text Only",
            tool_call: false,
            modalities: { input: ["text"], output: ["text"] },
          },
          "vision-with-tools": {
            id: "vision-with-tools",
            name: "Vision Tools",
            tool_call: true,
            modalities: { input: ["text", "image"], output: ["text"] },
          },
        },
      },
    ];

    const catalog = parseModelsDevCatalog(customJson);
    useModelStore.getState().setModels(catalog);

    // Tools check
    expect(
      showPlugins("test-provider" as ServiceProvider, "text-only-no-tools"),
    ).toBe(false);
    expect(
      showPlugins("test-provider" as ServiceProvider, "vision-with-tools"),
    ).toBe(true);

    // Vision / Upload check
    expect(isVisionModel("text-only-no-tools")).toBe(false);
    expect(isVisionModel("vision-with-tools")).toBe(true);
  });

  it("backend dynamically loads preset packages and resolves real-time env keys", () => {
    process.env.MY_CUSTOM_GEMINI_KEY = "test-gemini-key";
    process.env.MY_CUSTOM_OPENAI_KEY = "test-openai-key";

    // 1. Google with real-time env lookup
    const googleModel = createLanguageModel({
      messages: [{ role: "user", content: "Hello" }],
      model: "gemini-3.5-flash",
      provider: "google",
      npm: "@ai-sdk/google",
      env: ["NON_EXISTENT_VAR", "MY_CUSTOM_GEMINI_KEY"],
      modelConfig: {
        reasoningConfig: {
          thinkingBudget: 2048,
        },
      },
    });
    expect(googleModel).toBeDefined();
    expect(googleModel.modelId).toBe("gemini-3.5-flash");

    // 2. OpenAI Compatible with custom API base URL
    const compatibleModel = createLanguageModel({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-5-mini",
      provider: "openai",
      npm: "@ai-sdk/openai-compatible",
      api: "http://127.0.0.1:11434/v1",
      env: ["MY_CUSTOM_OPENAI_KEY"],
    });
    expect(compatibleModel).toBeDefined();
    expect(compatibleModel.modelId).toBe("gpt-5-mini");

    // 3. Anthropic preset
    process.env.MY_ANTHROPIC_KEY = "test-anthropic-key";
    const anthropicModel = createLanguageModel({
      messages: [{ role: "user", content: "Hello" }],
      model: "claude-3-7-sonnet",
      provider: "anthropic",
      npm: "@ai-sdk/anthropic",
      env: ["MY_ANTHROPIC_KEY"],
    });
    expect(anthropicModel).toBeDefined();
    expect(anthropicModel.modelId).toBe("claude-3-7-sonnet");

    // 4. Google Vertex preset
    const vertexModel = createLanguageModel({
      messages: [{ role: "user", content: "Hello" }],
      model: "gemini-2.5-flash",
      provider: "vertex",
      npm: "@ai-sdk/google-vertex",
      env: ["MY_CUSTOM_GEMINI_KEY"],
    });
    expect(vertexModel).toBeDefined();
    expect(vertexModel.modelId).toBe("gemini-2.5-flash");
  });

  it("creates models with AI SDK specificationVersion 'v4' that work with streamText (e.g. gemma4:12b)", () => {
    const gemmaModel = createLanguageModel({
      messages: [{ role: "user", content: "Hello" }],
      model: "gemma4:12b",
      provider: "openai",
      npm: "@ai-sdk/openai-compatible",
      api: "http://127.0.0.1:11434/v1",
      customConfig: {
        apiKey: "test-key",
      },
    });

    expect(gemmaModel).toBeDefined();
    expect(gemmaModel.specificationVersion).toBe("v4");
    expect(() => {
      streamText({
        model: gemmaModel,
        prompt: "Hello Gemma 4",
      });
    }).not.toThrow();

    const vertexModel = createLanguageModel({
      messages: [{ role: "user", content: "Hello" }],
      model: "gemini-2.5-flash",
      provider: "vertex",
      npm: "@ai-sdk/google-vertex",
      customConfig: {
        apiKey: "test-key",
      },
    });

    expect(vertexModel).toBeDefined();
    expect(vertexModel.specificationVersion).toBe("v4");
    expect(() => {
      streamText({
        model: vertexModel,
        prompt: "Hello Vertex",
      });
    }).not.toThrow();
  });
});

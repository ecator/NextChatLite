import { getServerSideConfig, getDefaultModel } from "@/config/server";
import { getBuildConfig } from "@/config/build";

describe("getServerSideConfig - NEXTCHATLITE_DEFAULT_MODEL & DEFAULT_MODEL", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXTCHATLITE_DEFAULT_MODEL;
    delete process.env.DEFAULT_MODEL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("defaults to first model in models.json (google/gemini-3.5-flash) when DEFAULT_MODEL is empty or unset", () => {
    const config = getServerSideConfig();
    expect(config.defaultModel).toBe("google/gemini-3.5-flash");
    expect(getDefaultModel()).toBe("google/gemini-3.5-flash");
  });

  test("uses NEXTCHATLITE_DEFAULT_MODEL when provided", () => {
    process.env.NEXTCHATLITE_DEFAULT_MODEL = "openai/gpt-5.1";
    const config = getServerSideConfig();
    expect(config.defaultModel).toBe("openai/gpt-5.1");
    expect(getDefaultModel()).toBe("openai/gpt-5.1");
  });

  test("prioritizes NEXTCHATLITE_DEFAULT_MODEL over DEFAULT_MODEL", () => {
    process.env.NEXTCHATLITE_DEFAULT_MODEL = "google/gemini-2.5-flash";
    process.env.DEFAULT_MODEL = "openai/gpt-5.1";
    const config = getServerSideConfig();
    expect(config.defaultModel).toBe("google/gemini-2.5-flash");
    expect(getDefaultModel()).toBe("google/gemini-2.5-flash");
  });

  test("preserves provider/model format when DEFAULT_MODEL already includes provider", () => {
    process.env.DEFAULT_MODEL = "openai/gpt-5.1";
    const config = getServerSideConfig();
    expect(config.defaultModel).toBe("openai/gpt-5.1");

    process.env.DEFAULT_MODEL = "google/gemini-2.5-flash";
    expect(getDefaultModel()).toBe("google/gemini-2.5-flash");
  });

  test("resolves provider from models.json when DEFAULT_MODEL is specified without provider", () => {
    process.env.DEFAULT_MODEL = "gpt-5-mini";
    const config = getServerSideConfig();
    expect(config.defaultModel).toBe("openai/gpt-5-mini");

    process.env.DEFAULT_MODEL = "gemini-3.5-flash";
    expect(getDefaultModel()).toBe("google/gemini-3.5-flash");
  });

  test("formats unknown models into provider/model using first provider as fallback", () => {
    process.env.DEFAULT_MODEL = "my-custom-model";
    const config = getServerSideConfig();
    expect(config.defaultModel).toBe("google/my-custom-model");
  });

  test("contains only active server configuration without deprecated backwards-compatibility fields", () => {
    const config = getServerSideConfig();
    expect(config).toHaveProperty("title");
    expect(config).toHaveProperty("subTitle");
    expect(config).toHaveProperty("defaultModel");
    expect((config as any).gaId).toBeUndefined();
    expect((config as any).gtmId).toBeUndefined();
    expect((config as any).isVercel).toBeUndefined();
    expect((config as any).needCode).toBeUndefined();
    expect((config as any).codes).toBeUndefined();
    expect((config as any).customModels).toBeUndefined();
    expect((config as any).visionModels).toBeUndefined();
  });

  test("contains active build configuration without legacy git commit fields", () => {
    const buildConfig = getBuildConfig();
    expect(buildConfig).toHaveProperty("version");
    expect(buildConfig).toHaveProperty("buildMode");
    expect((buildConfig as any).commitDate).toBeUndefined();
    expect((buildConfig as any).commitHash).toBeUndefined();
  });
});

describe("NEXTCHATLITE_TITLE and NEXTCHATLITE_SUBTITLE config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXTCHATLITE_TITLE;
    delete process.env.NEXTCHATLITE_SUBTITLE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("defaults title to NextChatLite and subTitle to Your own AI assistant.", () => {
    const serverConfig = getServerSideConfig();
    expect(serverConfig.title).toBe("NextChatLite");
    expect(serverConfig.subTitle).toBe("Your own AI assistant.");

    const buildConfig = getBuildConfig();
    expect(buildConfig.title).toBe("NextChatLite");
    expect(buildConfig.subTitle).toBe("Your own AI assistant.");
  });

  test("uses custom NEXTCHATLITE_TITLE and NEXTCHATLITE_SUBTITLE when provided", () => {
    process.env.NEXTCHATLITE_TITLE = "My AI Hub";
    process.env.NEXTCHATLITE_SUBTITLE = "Powering intelligence daily.";

    const serverConfig = getServerSideConfig();
    expect(serverConfig.title).toBe("My AI Hub");
    expect(serverConfig.subTitle).toBe("Powering intelligence daily.");

    const buildConfig = getBuildConfig();
    expect(buildConfig.title).toBe("My AI Hub");
    expect(buildConfig.subTitle).toBe("Powering intelligence daily.");
  });
});

describe("NEXTCHATLITE_HELP_URL config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXTCHATLITE_HELP_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("defaults helpUrl to undefined when NEXTCHATLITE_HELP_URL is unset", () => {
    const serverConfig = getServerSideConfig();
    expect(serverConfig.helpUrl).toBeUndefined();

    const buildConfig = getBuildConfig();
    expect(buildConfig.helpUrl).toBeUndefined();
  });

  test("uses custom NEXTCHATLITE_HELP_URL when provided", () => {
    process.env.NEXTCHATLITE_HELP_URL = "https://help.example.com";

    const serverConfig = getServerSideConfig();
    expect(serverConfig.helpUrl).toBe("https://help.example.com");

    const buildConfig = getBuildConfig();
    expect(buildConfig.helpUrl).toBe("https://help.example.com");
  });
});

describe("NEXTCHATLITE_DEFAULT_SYSTEM_TEMPLATE config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXTCHATLITE_DEFAULT_SYSTEM_TEMPLATE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("defaults defaultSystemTemplate to DEFAULT_SYSTEM_TEMPLATE when unset", () => {
    const serverConfig = getServerSideConfig();
    expect(serverConfig.defaultSystemTemplate).toContain(
      "helpful AI assistant",
    );

    const buildConfig = getBuildConfig();
    expect(buildConfig.defaultSystemTemplate).toContain("helpful AI assistant");
  });

  test("uses custom NEXTCHATLITE_DEFAULT_SYSTEM_TEMPLATE when provided", () => {
    process.env.NEXTCHATLITE_DEFAULT_SYSTEM_TEMPLATE =
      "Custom system prompt for {{model}}";

    const serverConfig = getServerSideConfig();
    expect(serverConfig.defaultSystemTemplate).toBe(
      "Custom system prompt for {{model}}",
    );

    const buildConfig = getBuildConfig();
    expect(buildConfig.defaultSystemTemplate).toBe(
      "Custom system prompt for {{model}}",
    );
  });
});

describe("NEXTCHATLITE_DEFAULT_INPUT_TEMPLATE config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXTCHATLITE_DEFAULT_INPUT_TEMPLATE;
    delete process.env.DEFAULT_INPUT_TEMPLATE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("defaults template to DEFAULT_INPUT_TEMPLATE when unset", () => {
    const buildConfig = getBuildConfig();
    expect(buildConfig.template).toBe("{{input}}");
  });

  test("uses custom NEXTCHATLITE_DEFAULT_INPUT_TEMPLATE when provided", () => {
    process.env.NEXTCHATLITE_DEFAULT_INPUT_TEMPLATE = "Prefix: {{input}}";
    const buildConfig = getBuildConfig();
    expect(buildConfig.template).toBe("Prefix: {{input}}");
  });

  test("falls back to DEFAULT_INPUT_TEMPLATE when NEXTCHATLITE_DEFAULT_INPUT_TEMPLATE is unset", () => {
    process.env.DEFAULT_INPUT_TEMPLATE = "Fallback: {{input}}";
    const buildConfig = getBuildConfig();
    expect(buildConfig.template).toBe("Fallback: {{input}}");
  });

  test("prioritizes NEXTCHATLITE_DEFAULT_INPUT_TEMPLATE over DEFAULT_INPUT_TEMPLATE", () => {
    process.env.NEXTCHATLITE_DEFAULT_INPUT_TEMPLATE = "Primary: {{input}}";
    process.env.DEFAULT_INPUT_TEMPLATE = "Fallback: {{input}}";
    const buildConfig = getBuildConfig();
    expect(buildConfig.template).toBe("Primary: {{input}}");
  });
});

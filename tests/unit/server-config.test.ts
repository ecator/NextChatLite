import { getServerSideConfig } from "@/config/server";
import { getBuildConfig } from "@/config/build";

describe("getServerSideConfig - OPENAI_URL", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_URL;
    delete (process.env as any).BASE_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("uses OPENAI_URL when defined", () => {
    process.env.OPENAI_URL = "https://custom-openai.example.com";
    const config = getServerSideConfig();
    expect(config.openaiUrl).toBe("https://custom-openai.example.com");
  });

  test("does not read BASE_URL", () => {
    (process.env as any).BASE_URL = "https://legacy-base.example.com";
    const config = getServerSideConfig();
    expect(config.openaiUrl).toBeUndefined();
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

  test("defaults title to NextChatLite and subTitle to Build your own AI assistant.", () => {
    const serverConfig = getServerSideConfig();
    expect(serverConfig.title).toBe("NextChatLite");
    expect(serverConfig.subTitle).toBe("Build your own AI assistant.");

    const buildConfig = getBuildConfig();
    expect(buildConfig.title).toBe("NextChatLite");
    expect(buildConfig.subTitle).toBe("Build your own AI assistant.");
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

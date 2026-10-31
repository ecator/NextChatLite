import { getServerSideConfig } from "@/config/server";

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

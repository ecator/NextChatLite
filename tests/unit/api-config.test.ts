/**
 * @jest-environment node
 */
import { GET } from "@/app/api/config/route";

describe("/api/config route", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns helpUrl when NEXTCHATLITE_HELP_URL is configured", async () => {
    process.env.NEXTCHATLITE_HELP_URL = "https://example.com/help";
    const res = await GET();
    const data = await res.json();
    expect(data.helpUrl).toBe("https://example.com/help");
  });

  it("returns undefined helpUrl when NEXTCHATLITE_HELP_URL is not set", async () => {
    delete process.env.NEXTCHATLITE_HELP_URL;
    const res = await GET();
    const data = await res.json();
    expect(data.helpUrl).toBeUndefined();
  });

  it("returns defaultSystemTemplate from configuration", async () => {
    process.env.NEXTCHATLITE_DEFAULT_SYSTEM_TEMPLATE = "Hello {{model}}";
    const res = await GET();
    const data = await res.json();
    expect(data.defaultSystemTemplate).toBe("Hello {{model}}");
  });
});

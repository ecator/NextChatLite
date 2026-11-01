import { execFileSync } from "child_process";
import path from "path";
import { parseArgs, filterProviders } from "../../scripts/fetch-providers.mjs";

describe("fetch-providers.mjs", () => {
  const sampleData = {
    google: {
      id: "google",
      name: "Google",
      models: {
        "gemini-3.5-flash": {
          id: "gemini-3.5-flash",
          name: "Gemini 3.5 Flash",
        },
        "gemini-3.5-pro": {
          id: "gemini-3.5-pro",
          name: "Gemini 3.5 Pro",
        },
      },
    },
    openai: {
      id: "openai",
      name: "OpenAI",
      models: {
        "gpt-5": {
          id: "gpt-5",
          name: "GPT-5",
        },
        "gpt-5-mini": {
          id: "gpt-5-mini",
          name: "GPT-5 Mini",
        },
      },
    },
    anthropic: {
      id: "anthropic",
      name: "Anthropic",
      models: {
        "claude-4-sonnet": {
          id: "claude-4-sonnet",
          name: "Claude 4 Sonnet",
        },
      },
    },
  };

  describe("parseArgs", () => {
    test("parses named options with -- or - flags", () => {
      const args1 = [
        "--provider",
        "google",
        "--model",
        "flash",
        "--output",
        "public/providers.json",
      ];
      expect(parseArgs(args1)).toEqual({
        provider: "google",
        model: "flash",
        output: "public/providers.json",
      });

      const args2 = ["-p", "openai", "-m", "gpt", "-o", "out.json"];
      expect(parseArgs(args2)).toEqual({
        provider: "openai",
        model: "gpt",
        output: "out.json",
      });

      const args3 = [
        "--provider=google",
        "--model=flash",
        "--output=test.json",
      ];
      expect(parseArgs(args3)).toEqual({
        provider: "google",
        model: "flash",
        output: "test.json",
      });
    });

    test("parses key=value style arguments", () => {
      const args = ["provider=google", "model=flash", "output=test.json"];
      expect(parseArgs(args)).toEqual({
        provider: "google",
        model: "flash",
        output: "test.json",
      });
    });

    test("parses positional arguments [provider, model, output]", () => {
      const args = ["google", "flash", "public/providers.json"];
      expect(parseArgs(args)).toEqual({
        provider: "google",
        model: "flash",
        output: "public/providers.json",
      });
    });

    test("handles partial positional arguments", () => {
      expect(parseArgs(["google"])).toEqual({
        provider: "google",
        model: undefined,
        output: undefined,
      });

      expect(parseArgs(["google", "flash"])).toEqual({
        provider: "google",
        model: "flash",
        output: undefined,
      });
    });
  });

  describe("filterProviders", () => {
    test("converts top-level object to an array and keeps all providers when no filters", () => {
      const result = filterProviders(sampleData);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
      expect(result.map((p) => p.id)).toEqual([
        "google",
        "openai",
        "anthropic",
      ]);
      expect(result[0].models).toEqual(sampleData.google.models);
    });

    test("filters providers by provider regex (case-insensitive)", () => {
      const result = filterProviders(sampleData, { provider: "OPENAI" });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("openai");
      expect(Object.keys(result[0].models)).toEqual(["gpt-5", "gpt-5-mini"]);
    });

    test("filters models by model regex (case-insensitive) across providers", () => {
      const result = filterProviders(sampleData, { model: "SONNET" });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("anthropic");
      expect(Object.keys(result[0].models)).toEqual(["claude-4-sonnet"]);
    });

    test("combines provider and model filters", () => {
      const result = filterProviders(sampleData, {
        provider: "^google$",
        model: "flash",
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("google");
      expect(Object.keys(result[0].models)).toEqual(["gemini-3.5-flash"]);
    });

    test("omits provider when model filter matches 0 models in that provider", () => {
      const result = filterProviders(sampleData, {
        provider: "google",
        model: "gpt",
      });
      expect(result.length).toBe(0);
    });

    test("throws descriptive error when regular expression is invalid", () => {
      expect(() => {
        filterProviders(sampleData, { provider: "[" });
      }).toThrow(/Invalid regular expression for provider/);

      expect(() => {
        filterProviders(sampleData, { model: "*invalid" });
      }).toThrow(/Invalid regular expression for model/);
    });
  });

  describe("CLI execution", () => {
    const scriptPath = path.resolve(
      __dirname,
      "../../scripts/fetch-providers.mjs",
    );

    test("prints help message with --help", () => {
      const stdout = execFileSync("node", [scriptPath, "--help"], {
        encoding: "utf8",
      });
      expect(stdout).toContain("Usage:");
      expect(stdout).toContain("--provider");
      expect(stdout).toContain("--model");
      expect(stdout).toContain("--output");
    });
  });
});

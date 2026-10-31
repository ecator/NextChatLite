import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chatApiPayloadSchema,
  normalizeBaseUrl,
  sanitizeError,
  createLanguageModel,
  ChatApiPayload,
} from "../../../src/app/api/chat/route";
import {
  convertOpenApiToAiTools,
  clampToolResultSize,
} from "../../../src/app/api/chat/tools";
import {
  parseModelMetadataSafely,
  parseModelsDevCatalog,
} from "../../../src/store/models";
import {
  formatThinkingDuration,
  extractPlainText,
} from "../../../src/utils/thinking";
import {
  readProjectFile,
  readJsonFile,
  fileExists,
  directoryExists,
} from "../fixtures/test_helpers";
import snapshot from "@opencode-ai/models/snapshot";

describe("Milestone 6 Empirical Challenger Stress & Regression Suite", () => {
  // =========================================================================
  // Section 1: Full Regression Sweep Across Features F1 through F18
  // =========================================================================
  describe("1. Full Feature Regression Sweep (F1 - F18)", () => {
    it("F1: verifies pnpm package manager lockfile and constraints", () => {
      assert.ok(fileExists("pnpm-lock.yaml"), "pnpm-lock.yaml must exist");
      assert.ok(!fileExists("yarn.lock"), "yarn.lock must be removed");
      assert.ok(!fileExists("package-lock.json"), "package-lock.json must not exist");

      const pkg = readJsonFile("package.json");
      assert.ok(
        typeof pkg.packageManager === "string" && pkg.packageManager.startsWith("pnpm@"),
        "package.json must specify pnpm in packageManager",
      );
    });

    it("F2: verifies Next.js 16 App Router & React 19 dependencies and structure", () => {
      const pkg = readJsonFile("package.json");
      assert.ok(pkg.dependencies.next, "next dependency must exist");
      assert.ok(pkg.dependencies.react, "react dependency must exist");
      assert.ok(pkg.dependencies.zustand, "zustand dependency must exist");

      assert.ok(directoryExists("src/app"), "app/ directory must exist");
      assert.ok(fileExists("src/app/page.tsx"), "app/page.tsx must exist");
      assert.ok(fileExists("src/app/layout.tsx"), "app/layout.tsx must exist");
    });

    it("F3: verifies non-web platform artifacts are completely stripped", () => {
      assert.ok(!directoryExists("src-tauri"), "src-tauri/ must not exist");
      assert.ok(!fileExists(".github/workflows/desktop.yml"), "desktop CI must not exist");
      assert.ok(!fileExists("src/utils/stream.ts"), "desktop stream.ts must not exist");

      const pkg = readJsonFile("package.json");
      assert.ok(!pkg.dependencies?.["@tauri-apps/api"], "Tauri dependencies must not exist");
    });

    it("F4: verifies commercial and SaaS artifacts are completely removed", () => {
      const constantContent = readProjectFile("src/constant.ts");
      assert.ok(!constantContent.includes("goSaas"), "goSaas must be removed");
      assert.ok(!constantContent.includes("saasStart"), "saasStart must be removed");
      assert.ok(!fileExists("src/components/saas.tsx"), "saas component must not exist");
    });

    it("F5: verifies root AGENTS.md and clean English documentation", () => {
      assert.ok(fileExists("AGENTS.md"), "Root AGENTS.md must exist");
      assert.ok(!fileExists("README.zh-CN.md"), "Multi-lang README.zh-CN.md must be removed");
      assert.ok(!fileExists("README.ja.md"), "Multi-lang README.ja.md must be removed");
    });

    it("F6: verifies all 20 UI localization dictionaries in app/locales/ exist and are valid", () => {
      const expectedLocales = [
        "ar", "bn", "cn", "cs", "da", "de", "en", "es", "fr", "id",
        "it", "jp", "ko", "no", "pt", "ru", "sk", "tr", "tw", "vi",
      ];
      for (const loc of expectedLocales) {
        assert.ok(
          fileExists(`src/locales/${loc}.ts`),
          `Localization dictionary src/locales/${loc}.ts must exist`,
        );
      }
    });

    it("F7: verifies standalone image generation (Stable Diffusion) is removed", () => {
      assert.ok(!fileExists("src/components/sd.tsx"), "sd.tsx must not exist");
      assert.ok(!fileExists("src/store/sd.ts"), "sd store must not exist");
      assert.ok(!directoryExists("src/app/api/sd"), "src/app/api/sd route must not exist");
    });

    it("F8: verifies MCP (Model Context Protocol) is removed", () => {
      assert.ok(!directoryExists("app/mcp"), "app/mcp/ must not exist");
      assert.ok(!fileExists("src/store/mcp.ts"), "src/store/mcp.ts must not exist");
      assert.ok(!fileExists("src/components/mcp-market.tsx"), "mcp-market must not exist");

      const pkg = readJsonFile("package.json");
      assert.ok(!pkg.dependencies?.["@modelcontextprotocol/sdk"], "MCP SDK must not be in dependencies");
    });

    it("F9: verifies clean chat core and session store", () => {
      assert.ok(fileExists("src/store/chat.ts"), "src/store/chat.ts must exist");
      assert.ok(fileExists("src/components/chat.tsx"), "src/components/chat.tsx must exist");
      assert.ok(fileExists("src/masks/build.ts"), "Mask build script must exist");
    });

    it("F10: verifies models.dev dynamic metadata integration and fallback", () => {
      assert.ok(fileExists("src/store/models.ts"), "src/store/models.ts must exist");
      const catalog = parseModelsDevCatalog(snapshot);
      assert.ok(Object.keys(catalog).length > 0, "Snapshot catalog must contain models");
    });

    it("F11: verifies dynamic model selector and limit validation logic", () => {
      const gpt4o = parseModelMetadataSafely({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        limit: { context: 128000, output: 4096 },
        attachment: true,
      });
      assert.strictEqual(gpt4o.contextLimit, 128000);
      assert.strictEqual(gpt4o.hasVision, true);
    });

    it("F12: verifies Vercel AI SDK streaming route", () => {
      assert.ok(fileExists("src/app/api/chat/route.ts"), "src/app/api/chat/route.ts must exist");
      const routeCode = readProjectFile("src/app/api/chat/route.ts");
      assert.ok(routeCode.includes("streamText"), "route.ts must use streamText");
      assert.ok(routeCode.includes("toDataStreamResponse"), "route.ts must use toDataStreamResponse");
    });

    it("F13: verifies custom Base URL and API key override handling", () => {
      const normalized = normalizeBaseUrl("https://my-custom-proxy.com/v1/");
      assert.strictEqual(normalized, "https://my-custom-proxy.com/v1");

      const sanitized = sanitizeError("Error with sk-abcdef1234567890 key", "my-secret-key");
      assert.ok(!sanitized.includes("sk-abcdef1234567890"));
      assert.ok(sanitized.includes("[REDACTED_API_KEY]"));
    });

    it("F14: verifies OpenAPI plugin tool calling bridge", () => {
      assert.ok(fileExists("src/app/api/chat/tools.ts"), "src/app/api/chat/tools.ts must exist");
      const tools = convertOpenApiToAiTools([], []);
      assert.deepStrictEqual(tools, {}, "Empty plugin list yields empty tools record");
    });

    it("F15: verifies Gemini 3 thinking signatures configuration", () => {
      const model = createLanguageModel({
        messages: [{ role: "user", content: "hello" }],
        model: "gemini-3-pro-preview",
        provider: "google",
        modelConfig: {
          reasoningConfig: {
            thinkingBudget: 4096,
            thinkingLevel: "high",
          },
        },
      });
      assert.ok(model, "Gemini 3 model instance must be instantiated");
    });

    it("F16: verifies collapsible reasoning block utilities", () => {
      const duration = formatThinkingDuration(3500);
      assert.strictEqual(duration, "Thought for 3.5s");

      const extracted = extractPlainText("<think>Thinking step...</think>Final answer");
      assert.strictEqual(extracted, "Thinking step...Final answer");
    });

    it("F17 & F18: verifies test suites are structured into Tiers 1-5", () => {
      assert.ok(directoryExists("tests/e2e/tier1-features"), "Tier 1 must exist");
      assert.ok(directoryExists("tests/e2e/tier2-boundaries"), "Tier 2 must exist");
      assert.ok(directoryExists("tests/e2e/tier3-pairwise"), "Tier 3 must exist");
      assert.ok(directoryExists("tests/e2e/tier4-scenarios"), "Tier 4 must exist");
      assert.ok(directoryExists("tests/e2e/tier5-challenger"), "Tier 5 must exist");
    });
  });

  // =========================================================================
  // Section 2: Malformed URLs, Non-HTTP Schemas & SSRF Defense Boundary Stress
  // =========================================================================
  describe("2. Malformed URLs & Non-HTTP Schemas Boundary Stress", () => {
    const dangerousUrls = [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "file:///C:/Windows/System32/calc.exe",
      "ftp://ftp.example.com/files",
      "blob:https://example.com/uuid",
      "ldap://localhost:389/dc=example",
      "gopher://gopher.example.com",
      "view-source:https://google.com",
      "vbscript:msgbox(1)",
    ];

    for (const dUrl of dangerousUrls) {
      it(`2.1 rejects dangerous protocol: ${dUrl}`, () => {
        assert.throws(
          () => normalizeBaseUrl(dUrl),
          /Disallowed protocol/,
          `normalizeBaseUrl must throw Disallowed protocol for ${dUrl}`,
        );
      });
    }

    it("2.2 normalizes complex valid URLs with trailing slashes, whitespace and paths", () => {
      assert.strictEqual(
        normalizeBaseUrl("   https://api.openai.com/v1/chat/completions/   "),
        "https://api.openai.com/v1/chat/completions",
      );
      assert.strictEqual(
        normalizeBaseUrl("http://localhost:8080/v1/"),
        "http://localhost:8080/v1",
      );
      assert.strictEqual(
        normalizeBaseUrl("https://127.0.0.1:11434/v1/"),
        "https://127.0.0.1:11434/v1",
      );
      assert.strictEqual(
        normalizeBaseUrl("http://[::1]:8080/v1/"),
        "http://[::1]:8080/v1",
      );
    });

    it("2.3 strips dangerous query parameters and fragments from base URLs", () => {
      assert.strictEqual(
        normalizeBaseUrl("https://api.groq.com/openai/v1?auth=secret_token#section"),
        "https://api.groq.com/openai/v1",
      );
    });

    it("2.4 handles invalid and unparseable strings gracefully without throwing unhandled exceptions", () => {
      assert.strictEqual(normalizeBaseUrl(""), undefined);
      assert.strictEqual(normalizeBaseUrl("   "), undefined);
      assert.strictEqual(normalizeBaseUrl(undefined), undefined);

      // Non-URL string without protocol should be trimmed safely
      const trimmed = normalizeBaseUrl("invalid-hostname-without-protocol");
      assert.strictEqual(trimmed, "invalid-hostname-without-protocol");
    });
  });

  // =========================================================================
  // Section 3: Large Payloads, Token Limits & Boundary Clamping Stress
  // =========================================================================
  describe("3. Large Payloads & Token Limits Stress", () => {
    it("3.1 validates huge 1MB single message payload safely", () => {
      const hugeText = "A".repeat(1024 * 1024); // 1 Megabyte
      const payload: ChatApiPayload = {
        messages: [{ role: "user", content: hugeText }],
        model: "gpt-4o",
        provider: "openai",
      };

      const result = chatApiPayloadSchema.safeParse(payload);
      assert.ok(result.success, "Schema must accept large message payloads");
      if (result.success) {
        assert.strictEqual(result.data.messages[0].content.length, 1024 * 1024);
      }
    });

    it("3.2 validates deep conversation history with 2000 turns", () => {
      const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
      for (let i = 0; i < 2000; i++) {
        messages.push({
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Turn ${i} conversation message content.`,
        });
      }

      const result = chatApiPayloadSchema.safeParse({
        messages,
        model: "claude-3-7-sonnet",
        provider: "anthropic",
      });
      assert.ok(result.success, "Schema must accept 2000 turn conversations");
    });

    it("3.3 enforces schema boundaries on numerical hyperparameters", () => {
      // temperature > 2 is invalid
      assert.ok(
        !chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { temperature: 2.5 },
        }).success,
      );

      // temperature < 0 is invalid
      assert.ok(
        !chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { temperature: -0.1 },
        }).success,
      );

      // top_p > 1 is invalid
      assert.ok(
        !chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { top_p: 1.2 },
        }).success,
      );

      // max_tokens <= 0 is invalid
      assert.ok(
        !chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: { max_tokens: 0 },
        }).success,
      );

      // valid boundary values
      assert.ok(
        chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "hi" }],
          model: "gpt-4o",
          provider: "openai",
          modelConfig: {
            temperature: 0.0,
            top_p: 1.0,
            max_tokens: 65536,
          },
        }).success,
      );
    });

    it("3.4 clamps massive tool output > 100,000 characters safely", () => {
      const hugeOutput = "X".repeat(200_000);
      const clamped = clampToolResultSize(hugeOutput);
      assert.ok(clamped.length < 150_000, "Output must be clamped");
      assert.ok(clamped.includes("[TRUNCATED_DUE_TO_SIZE]"));

      // Non-string output handling
      const objOutput = { status: "success", data: "Y".repeat(150_000) };
      const clampedObj = clampToolResultSize(objOutput);
      assert.ok(clampedObj.includes("[TRUNCATED_DUE_TO_SIZE]"));
    });

    it("3.5 executes ReDoS-safe extraction on 200,000 character thinking streams in < 50ms", () => {
      const massiveReasoning = `<think>${"Let me analyze this deep mathematical problem.\n".repeat(4000)}</think>The solution is 42.`;
      const start = Date.now();
      const extracted = extractPlainText(massiveReasoning);
      const duration = Date.now() - start;

      assert.ok(duration < 50, `Extraction took ${duration}ms, must be < 50ms for ReDoS safety`);
      assert.ok(extracted.includes("The solution is 42."));
    });
  });

  // =========================================================================
  // Section 4: LaTeX Math Edge Cases & Delimiter Stress
  // =========================================================================
  describe("4. LaTeX Math Edge Cases & Delimiter Stress", () => {
    function escapeBrackets(text: string) {
      const pattern =
        /(```[\s\S]*?```|`.*?`)|\\\[([\s\S]*?[^\\])\\\]|\\\((.*?)\\\)/g;
      return text.replace(
        pattern,
        (match, codeBlock, squareBracket, roundBracket) => {
          if (codeBlock) {
            return codeBlock;
          } else if (squareBracket) {
            return `$$${squareBracket}$$`;
          } else if (roundBracket) {
            return `$${roundBracket}$`;
          }
          return match;
        },
      );
    }

    it("4.1 converts LaTeX \\[ ... \\] and \\( ... \\) to $$ ... $$ and $ ... $ outside code blocks", () => {
      const input = "Here is an equation: \\[ E = mc^2 \\] and inline \\( a^2 + b^2 = c^2 \\).";
      const converted = escapeBrackets(input);
      assert.strictEqual(
        converted,
        "Here is an equation: $$ E = mc^2 $$ and inline $ a^2 + b^2 = c^2 $.",
      );
    });

    it("4.2 preserves bracket notations inside code blocks and inline code fences", () => {
      const codeBlockInput = "```typescript\nconst arr = \\[1, 2, 3\\];\n```\nOutside: \\[ x + y \\]";
      const converted = escapeBrackets(codeBlockInput);
      assert.strictEqual(
        converted,
        "```typescript\nconst arr = \\[1, 2, 3\\];\n```\nOutside: $$ x + y $$",
      );

      const inlineCodeInput = "Use `\\[test\\]` in regex. But math: \\( x = 1 \\)";
      const convertedInline = escapeBrackets(inlineCodeInput);
      assert.strictEqual(
        convertedInline,
        "Use `\\[test\\]` in regex. But math: $ x = 1 $",
      );
    });

    it("4.3 handles nested brackets, multiline equations and complex matrices", () => {
      const matrixInput = "\\[\n\\begin{pmatrix}\na & b \\\\\nc & d\n\\end{pmatrix}\n\\]";
      const converted = escapeBrackets(matrixInput);
      assert.strictEqual(
        converted,
        "$$\n\\begin{pmatrix}\na & b \\\\\nc & d\n\\end{pmatrix}\n$$",
      );
    });

    it("4.4 handles multibyte characters and CJK Unicode inside equations", () => {
      const multibyteInput = "\\[ \\text{概率 } P(A|B) = \\frac{P(B|A)P(A)}{P(B)} \\]";
      const converted = escapeBrackets(multibyteInput);
      assert.strictEqual(
        converted,
        "$$ \\text{概率 } P(A|B) = \\frac{P(B|A)P(A)}{P(B)} $$",
      );
    });

    it("4.5 ReDoS resilience on 10,000 repeated unclosed bracket patterns", () => {
      const repeatedMalicious = "\\[ a ".repeat(5000) + "end";
      const start = Date.now();
      const result = escapeBrackets(repeatedMalicious);
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 50, `escapeBrackets took ${elapsed}ms on pathological input, must be < 50ms`);
      assert.ok(typeof result === "string");
    });
  });

  // =========================================================================
  // Section 5: Offline Fallback & Network Fault Tolerance Stress
  // =========================================================================
  describe("5. Offline Fallback & Network Fault Tolerance Stress", () => {
    it("5.1 parseModelsDevCatalog recovers safely from corrupted, null or non-object payloads", () => {
      assert.deepStrictEqual(parseModelsDevCatalog(null), {});
      assert.deepStrictEqual(parseModelsDevCatalog(undefined), {});
      assert.deepStrictEqual(parseModelsDevCatalog("invalid json string"), {});
      assert.deepStrictEqual(parseModelsDevCatalog(12345), {});
      assert.deepStrictEqual(parseModelsDevCatalog([]), {});
    });

    it("5.2 parses partial models correctly and provides resilient defaults", () => {
      const partial = parseModelMetadataSafely({ id: "my-custom-model" });
      assert.strictEqual(partial.id, "my-custom-model");
      assert.strictEqual(partial.provider, "custom");
      assert.strictEqual(partial.contextLimit, 4096);
      assert.strictEqual(partial.outputLimit, 4096);
      assert.strictEqual(partial.hasVision, false);
      assert.strictEqual(partial.hasReasoning, false);
      assert.strictEqual(partial.hasTools, true);
    });

    it("5.3 parses models with string limits and diverse reasoning indicators", () => {
      const model = parseModelMetadataSafely({
        id: "google/gemini-3-pro",
        limit: { context: "1000000", output: "65536" },
        reasoning_options: ["thinking_level"],
        modalities: { input: ["text", "image"] },
      });

      assert.strictEqual(model.contextLimit, 1000000);
      assert.strictEqual(model.outputLimit, 65536);
      assert.strictEqual(model.hasVision, true);
      assert.strictEqual(model.hasReasoning, true);
      assert.strictEqual(model.reasoningType, "level");
    });

    it("5.4 bundled snapshot fallback contains comprehensive providers (OpenAI, Anthropic, Google)", () => {
      const snapshotCatalog = parseModelsDevCatalog(snapshot);
      const allModels = Object.values(snapshotCatalog);

      const hasOpenAI = allModels.some((m) => m.provider.toLowerCase() === "openai");
      const hasGoogle = allModels.some((m) => m.provider.toLowerCase() === "google");
      const hasAnthropic = allModels.some((m) => m.provider.toLowerCase() === "anthropic");

      assert.ok(hasOpenAI, "Snapshot must include OpenAI models");
      assert.ok(hasGoogle, "Snapshot must include Google models");
      assert.ok(hasAnthropic, "Snapshot must include Anthropic models");
    });
  });
});

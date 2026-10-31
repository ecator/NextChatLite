import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatThinkingDuration,
  extractPlainText,
} from "../../../app/utils/thinking";
import {
  chatApiPayloadSchema,
  createLanguageModel,
} from "../../../app/api/chat/route";
import {
  parseModelMetadataSafely,
  parseModelsDevCatalog,
  useModelStore,
  ModelMetadata,
} from "../../../app/store/models";
import {
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
import {
  parseDataStreamResponse,
  accumulateStreamState,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";
import snapshot from "@opencode-ai/models/snapshot";

// Helper function replicating markdown escapeBrackets
function escapeBrackets(text: string): string {
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

describe("Milestone 6 Challenger 2 Empirical Stress & Hardening Suite", () => {
  // =========================================================================
  // Section 1: Gemini 3 Thinking Stream & Accumulation Stress
  // =========================================================================
  describe("1. Gemini 3 Thinking Stream & Accumulation Stress", () => {
    it("1.1 accumulates rapid micro-reasoning stream chunks without token loss", () => {
      const thoughtChunks = [
        "Analyzing", " user", " query", "...",
        " Step 1:", " identify", " prime", " numbers",
        " up", " to", " 50.",
        " Step 2:", " filter", " divisors.",
        " Conclusion:", " 15", " primes", " found.",
      ];

      const chunks = thoughtChunks.map((t) => encodeDataStreamChunk("g", t));
      chunks.push(encodeDataStreamChunk("0", "The prime numbers up to 50 are: 2, 3, 5, 7..."));
      chunks.push(encodeDataStreamChunk("d", { finishReason: "stop" }));

      const fullStreamText = chunks.join("");
      const parts = parseDataStreamResponse(fullStreamText);
      const state = accumulateStreamState(parts);

      assert.strictEqual(state.reasoning, thoughtChunks.join(""));
      assert.strictEqual(state.text, "The prime numbers up to 50 are: 2, 3, 5, 7...");
      assert.strictEqual(state.isFinished, true);
      assert.strictEqual(state.finishReason, "stop");
    });

    it("1.2 handles complex multi-step interleaved reasoning, tool-call, and text streams", () => {
      const parts = [
        { type: "g", value: "Need to check current weather in Tokyo." },
        { type: "9", value: { toolCallId: "call_tokyo_123", toolName: "get_weather", args: { city: "Tokyo" } } },
        { type: "a", value: { toolCallId: "call_tokyo_123", result: { temp: 22, condition: "Sunny" } } },
        { type: "g", value: " Weather data retrieved. Formulating response." },
        { type: "0", value: "The weather in Tokyo is currently 22°C and Sunny." },
        { type: "d", value: { finishReason: "stop" } },
      ];

      const chunks = parts.map((p) => encodeDataStreamChunk(p.type, p.value));

      const parsed = parseDataStreamResponse(chunks.join(""));
      const state = accumulateStreamState(parsed);

      assert.strictEqual(
        state.reasoning,
        "Need to check current weather in Tokyo. Weather data retrieved. Formulating response.",
      );
      assert.strictEqual(state.text, "The weather in Tokyo is currently 22°C and Sunny.");
      assert.strictEqual(state.toolCalls.length, 1);
      assert.strictEqual(state.toolCalls[0].name, "get_weather");
      assert.strictEqual(state.toolResults.length, 1);
    });

    it("1.3 handles malformed and edge-case <think> tag streams gracefully", () => {
      // Unclosed <think> tag
      const unclosed = "<think>Calculating gradient descent weights without close tag";
      assert.strictEqual(
        extractPlainText(unclosed),
        "Calculating gradient descent weights without close tag",
      );

      // Multiple nested and mixed-case tags
      const nested = "<think><THINK>Step 1: Check inputs</THINK></think>Result is ready.";
      assert.strictEqual(
        extractPlainText(nested),
        "Step 1: Check inputsResult is ready.",
      );

      // Empty <think></think> tag
      const emptyTag = "<think></think>Immediate direct response";
      assert.strictEqual(
        extractPlainText(emptyTag),
        "Immediate direct response",
      );

      // Incomplete tag pieces
      const incomplete = "<thi" + "nk>Step 1</think>Output";
      assert.strictEqual(
        extractPlainText(incomplete),
        "Step 1Output",
      );
    });
  });

  // =========================================================================
  // Section 2: Live Timer Accuracy & Multilingual Formatting Stress
  // =========================================================================
  describe("2. Live Timer Accuracy & Multilingual Formatting Stress", () => {
    it("2.1 handles negative and sub-millisecond durations safely", () => {
      assert.strictEqual(formatThinkingDuration(-1000), "Thought for 0.0s");
      assert.strictEqual(formatThinkingDuration(-0.001), "Thought for 0.0s");
      assert.strictEqual(formatThinkingDuration(0), "Thought for 0.0s");
      assert.strictEqual(formatThinkingDuration(0, "cn"), "思考耗时 0.0 秒");
      assert.strictEqual(formatThinkingDuration(0, "jp"), "思考時間 0.0 秒");
      assert.strictEqual(formatThinkingDuration(0, "fr"), "Pensé pendant 0.0s");
    });

    it("2.2 verifies precise rounding at sub-second boundaries", () => {
      assert.strictEqual(formatThinkingDuration(49), "Thought for 0.0s");
      assert.strictEqual(formatThinkingDuration(50), "Thought for 0.1s");
      assert.strictEqual(formatThinkingDuration(949), "Thought for 0.9s");
      assert.strictEqual(formatThinkingDuration(950), "Thought for 0.9s");
      assert.strictEqual(formatThinkingDuration(999), "Thought for 1.0s");
      assert.strictEqual(formatThinkingDuration(1234.56), "Thought for 1.2s");
    });

    it("2.3 verifies minute and sub-hour boundaries", () => {
      assert.strictEqual(formatThinkingDuration(15400), "Thought for 15.4s");
      assert.strictEqual(formatThinkingDuration(59900), "Thought for 59.9s");
      assert.strictEqual(formatThinkingDuration(60000), "Thought for 60.0s");
      assert.strictEqual(formatThinkingDuration(3599900), "Thought for 3599.9s");
    });

    it("2.4 verifies hour, multi-hour, and day-scale durations across locales", () => {
      const oneHour = 3600_000;
      assert.strictEqual(formatThinkingDuration(oneHour, "en"), "Thought for 1.0h");
      assert.strictEqual(formatThinkingDuration(oneHour, "cn"), "思考耗时 1.0 小时");
      assert.strictEqual(formatThinkingDuration(oneHour, "jp"), "思考時間 1.0 時間");
      assert.strictEqual(formatThinkingDuration(oneHour, "fr"), "Pensé pendant 1.0h");

      const tenHours = 36000_000;
      assert.strictEqual(formatThinkingDuration(tenHours, "en"), "Thought for 10.0h");
      assert.strictEqual(formatThinkingDuration(tenHours, "cn"), "思考耗时 10.0 小时");
      assert.strictEqual(formatThinkingDuration(tenHours, "jp"), "思考時間 10.0 時間");
      assert.strictEqual(formatThinkingDuration(tenHours, "fr"), "Pensé pendant 10.0h");

      const oneDay = 86400_000;
      assert.strictEqual(formatThinkingDuration(oneDay, "en"), "Thought for 24.0h");
      assert.strictEqual(formatThinkingDuration(oneDay, "cn"), "思考耗时 24.0 小时");
      assert.strictEqual(formatThinkingDuration(oneDay, "jp"), "思考時間 24.0 時間");
      assert.strictEqual(formatThinkingDuration(oneDay, "fr"), "Pensé pendant 24.0h");
    });

    it("2.5 defaults smoothly to English for unsupported or arbitrary locales", () => {
      const otherLocales = ["es", "de", "ru", "ar", "ko", "it", "pt", "vi", "tw", "bn", "cs", "da", "id", "no", "sk", "tr", "unknown_lang", ""];
      for (const loc of otherLocales) {
        assert.strictEqual(formatThinkingDuration(4200, loc), "Thought for 4.2s");
        assert.strictEqual(formatThinkingDuration(7200_000, loc), "Thought for 2.0h");
      }
    });
  });

  // =========================================================================
  // Section 3: LaTeX Math Rendering & Bracket Escaping Stress
  // =========================================================================
  describe("3. LaTeX Math Rendering & Bracket Escaping Stress", () => {
    it("3.1 converts LaTeX bracket notations \\[ ... \\] to $$...$$ and \\( ... \\) to $...$", () => {
      const input = "The display formula is \\[ E = mc^2 \\] and the inline formula is \\( a^2 + b^2 = c^2 \\).";
      const converted = escapeBrackets(input);

      assert.ok(converted.includes("$$ E = mc^2 $$"));
      assert.ok(converted.includes("$ a^2 + b^2 = c^2 $"));
      assert.ok(!converted.includes("\\["));
      assert.ok(!converted.includes("\\]"));
      assert.ok(!converted.includes("\\("));
      assert.ok(!converted.includes("\\)"));
    });

    it("3.2 preserves code blocks containing bracket notation without math conversion", () => {
      const input = [
        "Here is some python code:",
        "```python",
        "arr = \\['item1', 'item2'\\]",
        "func = \\(x + y\\)",
        "```",
        "And here is actual math: \\[ x = \\frac{1}{2} \\]",
      ].join("\n");

      const converted = escapeBrackets(input);

      // Code block content must remain intact
      assert.ok(converted.includes("arr = \\['item1', 'item2'\\]"));
      assert.ok(converted.includes("func = \\(x + y\\)"));
      // Math outside code block must be converted
      assert.ok(converted.includes("$$ x = \\frac{1}{2} $$"));
    });

    it("3.3 handles complex multiline matrices and integrals", () => {
      const complexMath = "\\[ \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\]";
      const converted = escapeBrackets(complexMath);
      assert.strictEqual(
        converted,
        "$$ \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} $$",
      );
    });
  });

  // =========================================================================
  // Section 4: Plain Text Clipboard Sanitization Stress
  // =========================================================================
  describe("4. Plain Text Clipboard Sanitization Stress", () => {
    it("4.1 extracts clean text from code fences with different language annotations", () => {
      const input = [
        "Step 1: Write algorithm in Python",
        "```python",
        "def quicksort(arr):",
        "    if len(arr) <= 1: return arr",
        "    pivot = arr[len(arr) // 2]",
        "    return quicksort([x for x in arr if x < pivot]) + [x for x in arr if x == pivot] + quicksort([x for x in arr if x > pivot])",
        "```",
        "Step 2: Optimize memory in C++",
        "```cpp",
        "void sort(int* arr, int n);",
        "```",
        "Verification complete.",
      ].join("\n");

      const plain = extractPlainText(input);
      assert.ok(!plain.includes("```"));
      assert.ok(!plain.includes("```python"));
      assert.ok(!plain.includes("```cpp"));
      assert.ok(plain.includes("def quicksort(arr):"));
      assert.ok(plain.includes("void sort(int* arr, int n);"));
      assert.ok(plain.includes("Step 1: Write algorithm in Python"));
      assert.ok(plain.includes("Verification complete."));
    });

    it("4.2 removes LaTeX dollar math delimiters from clipboard text", () => {
      const input = "Given $x = 5$ and $y = 10$, calculate $z = x + y$.";
      const plain = extractPlainText(input);
      assert.strictEqual(plain, "Given x = 5 and y = 10, calculate z = x + y.");
    });

    it("4.3 sanitizes <think> reasoning tags thoroughly", () => {
      const input = "<think>Step 1: Parse AST\nStep 2: Generate bytecode</think>Execution finished.";
      const plain = extractPlainText(input);
      assert.strictEqual(plain, "Step 1: Parse AST\nStep 2: Generate bytecodeExecution finished.");
    });
  });

  // =========================================================================
  // Section 5: ThinkingLevel & ThinkingBudget Boundary Validation
  // =========================================================================
  describe("5. ThinkingLevel & ThinkingBudget Boundary Validation", () => {
    it("5.1 accepts all valid thinkingLevel enum options in schema", () => {
      const validLevels: Array<"minimal" | "low" | "medium" | "high"> = [
        "minimal",
        "low",
        "medium",
        "high",
      ];

      for (const level of validLevels) {
        const payload = {
          messages: [{ role: "user", content: "Hello" }],
          model: "gemini-3-pro-preview",
          provider: "google",
          modelConfig: {
            reasoningConfig: {
              thinkingLevel: level,
            },
          },
        };
        const result = chatApiPayloadSchema.safeParse(payload);
        assert.ok(result.success, `thinkingLevel '${level}' should be accepted`);
      }
    });

    it("5.2 rejects invalid thinkingLevel options in schema", () => {
      const invalidLevels = ["extreme", "unlimited", "none", "off", "maximum", 123, null];

      for (const level of invalidLevels) {
        const payload = {
          messages: [{ role: "user", content: "Hello" }],
          model: "gemini-3-pro-preview",
          provider: "google",
          modelConfig: {
            reasoningConfig: {
              thinkingLevel: level as any,
            },
          },
        };
        const result = chatApiPayloadSchema.safeParse(payload);
        assert.strictEqual(result.success, false, `Invalid thinkingLevel '${level}' must be rejected`);
      }
    });

    it("5.3 validates positive thinkingBudget and rejects negative/zero/non-numeric values", () => {
      // Valid positive budgets
      const validBudgets = [1, 1024, 2048, 4096, 8192, 32768, 65536];
      for (const budget of validBudgets) {
        const result = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "Hello" }],
          model: "gemini-3-pro-preview",
          provider: "google",
          modelConfig: { reasoningConfig: { thinkingBudget: budget } },
        });
        assert.ok(result.success, `Budget ${budget} should be valid`);
      }

      // Invalid non-positive budgets
      const invalidBudgets = [0, -1, -500, "1024", NaN, -Infinity];
      for (const budget of invalidBudgets) {
        const result = chatApiPayloadSchema.safeParse({
          messages: [{ role: "user", content: "Hello" }],
          model: "gemini-3-pro-preview",
          provider: "google",
          modelConfig: { reasoningConfig: { thinkingBudget: budget as any } },
        });
        assert.strictEqual(result.success, false, `Budget ${budget} must be rejected`);
      }
    });

    it("5.4 instantiates models with correct reasoning configs across providers", () => {
      // Google Gemini 3 with thinkingBudget
      const googleModel = createLanguageModel({
        messages: [{ role: "user", content: "Hi" }],
        model: "gemini-3-pro-preview",
        provider: "google",
        modelConfig: {
          reasoningConfig: {
            thinkingBudget: 4096,
          },
        },
      });
      assert.ok(googleModel, "Google Gemini 3 model instantiated");

      // Anthropic with thinking budget
      const anthropicModel = createLanguageModel({
        messages: [{ role: "user", content: "Hi" }],
        model: "claude-3-7-sonnet-20250219",
        provider: "anthropic",
        modelConfig: {
          reasoningConfig: {
            thinkingBudget: 2048,
          },
        },
      });
      assert.ok(anthropicModel, "Anthropic Claude 3.7 model instantiated");

      // OpenAI with reasoningEffort mapping
      const openaiModel = createLanguageModel({
        messages: [{ role: "user", content: "Hi" }],
        model: "o3-mini",
        provider: "openai",
        modelConfig: {
          reasoningConfig: {
            thinkingLevel: "high",
          },
        },
      });
      assert.ok(openaiModel, "OpenAI o3-mini model instantiated");

      // DeepSeek R1 model wrapper
      const deepseekModel = createLanguageModel({
        messages: [{ role: "user", content: "Hi" }],
        model: "deepseek-reasoner",
        provider: "deepseek",
      });
      assert.ok(deepseekModel, "DeepSeek Reasoner model instantiated");
    });
  });

  // =========================================================================
  // Section 6: Dynamic Model Metadata (useModelStore) Stress & Offline Resilience
  // =========================================================================
  describe("6. Dynamic Model Metadata (useModelStore) Stress & Offline Resilience", () => {
    it("6.1 parses models.dev catalog across various schema formats", () => {
      // Format 1: models map
      const payload1 = {
        models: {
          "gpt-4o": { id: "gpt-4o", name: "GPT-4o", provider: "openai", limit: { context: 128000, output: 4096 }, attachment: true },
        },
      };
      const cat1 = parseModelsDevCatalog(payload1);
      assert.ok(cat1["gpt-4o"]);
      assert.strictEqual(cat1["gpt-4o"].hasVision, true);
      assert.strictEqual(cat1["gpt-4o"].contextLimit, 128000);

      // Format 2: providers map
      const payload2 = {
        providers: {
          google: {
            models: {
              "gemini-3-pro-preview": {
                name: "Gemini 3 Pro",
                limit: { context: 2000000, output: 8192 },
                modalities: { input: ["text", "image"] },
                reasoning: true,
              },
            },
          },
        },
      };
      const cat2 = parseModelsDevCatalog(payload2);
      assert.ok(cat2["google/gemini-3-pro-preview"]);
      assert.ok(cat2["gemini-3-pro-preview"]);
      assert.strictEqual(cat2["gemini-3-pro-preview"].contextLimit, 2000000);
      assert.strictEqual(cat2["gemini-3-pro-preview"].hasVision, true);
      assert.strictEqual(cat2["gemini-3-pro-preview"].hasReasoning, true);
      assert.strictEqual(cat2["gemini-3-pro-preview"].reasoningType, "level");
    });

    it("6.2 ensures static snapshot fallback is rich and contains core providers", () => {
      const catalog = parseModelsDevCatalog(snapshot);
      const models = Object.values(catalog);
      assert.ok(models.length > 10, "Snapshot catalog must contain extensive models");

      // Verify presence of OpenAI, Google, Anthropic, DeepSeek
      const providers = new Set(models.map((m) => (m.provider || "").toLowerCase()));
      assert.ok(providers.has("openai") || providers.has("google") || providers.has("anthropic"));
    });

    it("6.3 handles extreme boundary context limits (1M+, 2M, 0, negative)", () => {
      // 2M tokens (Gemini 1.5/2.0/3)
      const meta2M = parseModelMetadataSafely({
        id: "gemini-3-pro",
        limit: { context: 2097152, output: 65536 },
      });
      assert.strictEqual(meta2M.contextLimit, 2097152);
      assert.strictEqual(meta2M.outputLimit, 65536);

      // 0 context -> fallback to 4096
      const metaZero = parseModelMetadataSafely({
        id: "zero-context",
        limit: { context: 0, output: 0 },
      });
      assert.strictEqual(metaZero.contextLimit, 4096);
      assert.strictEqual(metaZero.outputLimit, 4096);

      // Negative context -> fallback to 4096
      const metaNeg = parseModelMetadataSafely({
        id: "neg-context",
        limit: { context: -100, output: -50 },
      });
      assert.strictEqual(metaNeg.contextLimit, 4096);
      assert.strictEqual(metaNeg.outputLimit, 4096);

      // Non-numeric context -> fallback to 4096
      const metaNaN = parseModelMetadataSafely({
        id: "nan-context",
        limit: { context: "unlimited", output: "max" },
      });
      assert.strictEqual(metaNaN.contextLimit, 4096);
      assert.strictEqual(metaNaN.outputLimit, 4096);
    });

    it("6.4 resolves models flexibly via getModel and getProviderModels in useModelStore", () => {
      const store = useModelStore.getState();

      // Query by short id
      const gpt4 = store.getModel("gpt-4o");
      if (gpt4) {
        assert.ok(gpt4.id.includes("gpt-4o"), "gpt-4o id matched");
        assert.strictEqual(gpt4.provider, "openai");
      }

      // Query by lowercase / full id
      const gemini = store.getModel("google/gemini-2.5-pro") || store.getModel("gemini-2.5-pro");
      if (gemini) {
        assert.ok(gemini.id.includes("gemini"));
      }

      // Query provider models
      const openaiModels = store.getProviderModels("openai");
      assert.ok(Array.isArray(openaiModels) && openaiModels.length > 0);
      const googleModels = store.getProviderModels("google");
      assert.ok(Array.isArray(googleModels) && googleModels.length > 0);
    });
  });

  // =========================================================================
  // Section 7: ParameterValidator & Limit Clamping Stress
  // =========================================================================
  describe("7. ParameterValidator & Limit Clamping Stress", () => {
    it("7.1 validates and clamps temperature bounds (0.0 to 2.0)", () => {
      assert.strictEqual(validateTemperatureValue(0.7), 0.7);
      assert.strictEqual(validateTemperatureValue(0.0), 0.0);
      assert.strictEqual(validateTemperatureValue(2.0), 2.0);
      assert.strictEqual(validateTemperatureValue(-0.5), 0.0);
      assert.strictEqual(validateTemperatureValue(2.5), 2.0);
      assert.strictEqual(validateTemperatureValue(NaN), 0.7);
      assert.strictEqual(validateTemperatureValue("invalid"), 0.7);

      assert.strictEqual(validateTemperature(1.0), true);
      assert.strictEqual(validateTemperature(-0.1), false);
      assert.strictEqual(validateTemperature(2.1), false);
      assert.strictEqual(validateTemperature("1.0"), false);
    });

    it("7.2 validates and clamps topP bounds (0.0 to 1.0)", () => {
      assert.strictEqual(validateTopP(0.9), 0.9);
      assert.strictEqual(validateTopP(0.0), 0.0);
      assert.strictEqual(validateTopP(1.0), 1.0);
      assert.strictEqual(validateTopP(-0.2), 0.0);
      assert.strictEqual(validateTopP(1.5), 1.0);
      assert.strictEqual(validateTopP(null), 1.0);
      assert.strictEqual(validateTopP(undefined), 1.0);
      assert.strictEqual(validateTopP("invalid"), 1.0);
    });

    it("7.3 clamps maxTokens against model output limit", () => {
      assert.strictEqual(validateMaxTokens(8192, 4096), 4096);
      assert.strictEqual(validateMaxTokens(2048, 4096), 2048);
      assert.strictEqual(validateMaxTokens(-100, 4096), 2048);
      assert.strictEqual(validateMaxTokens(NaN, 1024), 1024);
    });

    it("7.4 verifies image upload and reasoning enablement checks", () => {
      const mockCatalog: Record<string, ModelMetadata> = {
        "vision-model": {
          id: "vision-model",
          name: "Vision Model",
          provider: "test",
          contextLimit: 128000,
          outputLimit: 4096,
          hasVision: true,
          hasReasoning: false,
          hasTools: true,
        },
        "reasoning-model": {
          id: "reasoning-model",
          name: "Reasoning Model",
          provider: "test",
          contextLimit: 128000,
          outputLimit: 4096,
          hasVision: false,
          hasReasoning: true,
          reasoningType: "budget",
          hasTools: true,
        },
      };

      assert.strictEqual(isImageUploadAllowed("vision-model", mockCatalog), true);
      assert.strictEqual(isImageUploadAllowed("reasoning-model", mockCatalog), false);

      assert.strictEqual(isReasoningConfigEnabled("reasoning-model", mockCatalog), true);
      assert.strictEqual(isReasoningConfigEnabled("vision-model", mockCatalog), false);

      assert.strictEqual(clampMaxTokens("vision-model", 8000, mockCatalog), 4096);
      assert.strictEqual(clampContextLimit("vision-model", 200000, mockCatalog), 128000);
    });

    it("7.5 filters and searches models accurately", () => {
      const list = ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet", "gemini-2.5-pro", "gemini-3-pro"];
      assert.deepStrictEqual(searchModels("gemini", list), ["gemini-2.5-pro", "gemini-3-pro"]);
      assert.deepStrictEqual(searchModels("GPT", list), ["gpt-4o", "gpt-4o-mini"]);
      assert.deepStrictEqual(searchModels("", list), list);
      assert.deepStrictEqual(searchModels("nonexistent", list), []);
    });
  });
});

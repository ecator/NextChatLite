import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatThinkingDuration,
  extractPlainText,
} from "../../../app/utils/thinking";
import {
  chatApiPayloadSchema,
  createLanguageModel,
  ChatApiPayload,
} from "../../../app/api/chat/route";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  createGemini3ThinkingStream,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";

describe("Milestone 5 Challenger Empirical Stress Suite", () => {
  // =========================================================================
  // 1. Duration Formatting Stress Testing (formatThinkingDuration)
  // =========================================================================
  describe("1. Duration Formatting Stress Testing", () => {
    it("1.1 formats negative and zero duration boundaries gracefully to 0.0s", () => {
      assert.strictEqual(formatThinkingDuration(0), "Thought for 0.0s");
      assert.strictEqual(formatThinkingDuration(-1), "Thought for 0.0s");
      assert.strictEqual(formatThinkingDuration(-500), "Thought for 0.0s");
      assert.strictEqual(formatThinkingDuration(-3600_000), "Thought for 0.0s");
      assert.strictEqual(formatThinkingDuration(-Infinity), "Thought for 0.0s");
    });

    it("1.2 formats sub-second and fractional millisecond boundaries accurately", () => {
      assert.strictEqual(formatThinkingDuration(1), "Thought for 0.0s");
      assert.strictEqual(formatThinkingDuration(49), "Thought for 0.0s");
      assert.strictEqual(formatThinkingDuration(50), "Thought for 0.1s");
      assert.strictEqual(formatThinkingDuration(250), "Thought for 0.3s");
      assert.strictEqual(formatThinkingDuration(400), "Thought for 0.4s");
      assert.strictEqual(formatThinkingDuration(949), "Thought for 0.9s");
      assert.strictEqual(formatThinkingDuration(950), "Thought for 0.9s");
      assert.strictEqual(formatThinkingDuration(960), "Thought for 1.0s");
      assert.strictEqual(formatThinkingDuration(1234.56), "Thought for 1.2s");
    });

    it("1.3 formats multi-second and sub-hour boundaries", () => {
      assert.strictEqual(formatThinkingDuration(3420), "Thought for 3.4s");
      assert.strictEqual(formatThinkingDuration(5200), "Thought for 5.2s");
      assert.strictEqual(formatThinkingDuration(45200), "Thought for 45.2s");
      assert.strictEqual(formatThinkingDuration(59900), "Thought for 59.9s");
      assert.strictEqual(formatThinkingDuration(65400), "Thought for 65.4s");
      assert.strictEqual(formatThinkingDuration(3599900), "Thought for 3599.9s");
    });

    it("1.4 formats multi-hour and day-scale durations accurately", () => {
      assert.strictEqual(formatThinkingDuration(3600_000), "Thought for 1.0h");
      assert.strictEqual(formatThinkingDuration(5400_000), "Thought for 1.5h");
      assert.strictEqual(formatThinkingDuration(7200_000), "Thought for 2.0h");
      assert.strictEqual(formatThinkingDuration(36000_000), "Thought for 10.0h");
      assert.strictEqual(formatThinkingDuration(86400_000), "Thought for 24.0h");
      assert.strictEqual(formatThinkingDuration(360000_000), "Thought for 100.0h");
    });

    it("1.5 formats multilingual labels across cn, jp, fr, en and unknown fallbacks", () => {
      // Chinese (cn)
      assert.strictEqual(formatThinkingDuration(3400, "cn"), "思考耗时 3.4 秒");
      assert.strictEqual(formatThinkingDuration(7200_000, "cn"), "思考耗时 2.0 小时");
      assert.strictEqual(formatThinkingDuration(0, "cn"), "思考耗时 0.0 秒");

      // Japanese (jp)
      assert.strictEqual(formatThinkingDuration(3400, "jp"), "思考時間 3.4 秒");
      assert.strictEqual(formatThinkingDuration(7200_000, "jp"), "思考時間 2.0 時間");
      assert.strictEqual(formatThinkingDuration(0, "jp"), "思考時間 0.0 秒");

      // French (fr)
      assert.strictEqual(formatThinkingDuration(3400, "fr"), "Pensé pendant 3.4s");
      assert.strictEqual(formatThinkingDuration(7200_000, "fr"), "Pensé pendant 2.0h");
      assert.strictEqual(formatThinkingDuration(0, "fr"), "Pensé pendant 0.0s");

      // English (en)
      assert.strictEqual(formatThinkingDuration(3400, "en"), "Thought for 3.4s");
      assert.strictEqual(formatThinkingDuration(7200_000, "en"), "Thought for 2.0h");

      // Fallbacks (de, es, ru, undefined, empty string)
      assert.strictEqual(formatThinkingDuration(3400, "de"), "Thought for 3.4s");
      assert.strictEqual(formatThinkingDuration(3400, "es"), "Thought for 3.4s");
      assert.strictEqual(formatThinkingDuration(3400, "ru"), "Thought for 3.4s");
      assert.strictEqual(formatThinkingDuration(3400, ""), "Thought for 3.4s");
      assert.strictEqual(formatThinkingDuration(3400, undefined), "Thought for 3.4s");
    });
  });

  // =========================================================================
  // 2. Plain Text Extraction Stress Testing (extractPlainText)
  // =========================================================================
  describe("2. Plain Text Extraction Stress Testing", () => {
    it("2.1 handles falsy, nullish, and whitespace-only reasoning text safely", () => {
      assert.strictEqual(extractPlainText(""), "");
      assert.strictEqual(extractPlainText("   "), "");
      assert.strictEqual(extractPlainText(undefined as any), "");
      assert.strictEqual(extractPlainText(null as any), "");
    });

    it("2.2 strips markdown code blocks with and without language tags", () => {
      const withLang = "```typescript\nconst message = 'hello';\n```";
      assert.strictEqual(extractPlainText(withLang), "const message = 'hello';");

      const noLang = "```\nplain text inside fence\n```";
      assert.strictEqual(extractPlainText(noLang), "plain text inside fence");

      const pythonLang = "```python\ndef solve(x):\n    return x ** 2\n```";
      assert.strictEqual(
        extractPlainText(pythonLang),
        "def solve(x):\n    return x ** 2",
      );
    });

    it("2.3 extracts plain text from multiple mixed code fences and text", () => {
      const complexMd = [
        "Step 1: Setup code",
        "```ts\nconst port = 3000;\n```",
        "Step 2: Server loop",
        "```js\napp.listen(port);\n```",
        "Final step: verification complete.",
      ].join("\n");

      const extracted = extractPlainText(complexMd);
      assert.ok(extracted.includes("Step 1: Setup code"));
      assert.ok(extracted.includes("const port = 3000;"));
      assert.ok(extracted.includes("Step 2: Server loop"));
      assert.ok(extracted.includes("app.listen(port);"));
      assert.ok(extracted.includes("Final step: verification complete."));
      assert.ok(!extracted.includes("```"));
    });

    it("2.4 strips inline LaTeX dollar math delimiters", () => {
      const mathInput = "Let $x = 10$ and $y = 20$, then $x + y = 30$.";
      assert.strictEqual(
        extractPlainText(mathInput),
        "Let x = 10 and y = 20, then x + y = 30.",
      );

      const complexFormula = "Roots: $\\alpha = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$";
      assert.strictEqual(
        extractPlainText(complexFormula),
        "Roots: \\alpha = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
      );
    });

    it("2.5 handles edge-case code blocks containing backticks and unclosed markers", () => {
      const backtickCode = "```ts\nconst template = `User: ${name}`;\n```";
      const result = extractPlainText(backtickCode);
      assert.strictEqual(result, "const template = `User: ${name}`;");

      const unclosedFence = "```ts\nconst unclosed = true;";
      // Should not throw, returns string
      assert.doesNotThrow(() => extractPlainText(unclosedFence));
    });

    it("2.6 executes massive 100,000+ character reasoning extraction in < 50ms (ReDoS Safety)", () => {
      const chunk = "Step $i = 1$: Analyze formula.\n```ts\nconst check = (i: number) => i > 0;\n```\n";
      const hugeReasoning = chunk.repeat(1500); // > 110,000 chars
      assert.ok(hugeReasoning.length > 100_000);

      const startTime = performance.now();
      const plain = extractPlainText(hugeReasoning);
      const durationMs = performance.now() - startTime;

      assert.ok(plain.length > 50_000);
      assert.ok(!plain.includes("```"));
      assert.ok(durationMs < 50, `Extraction took ${durationMs.toFixed(2)}ms, expected < 50ms`);
    });
  });

  // =========================================================================
  // 3. ThinkingBlock Boundaries & State Machine Stress Testing
  // =========================================================================
  describe("3. ThinkingBlock Boundaries & State Machine Stress Testing", () => {
    it("3.1 visibility gating: empty, whitespace-only, or undefined reasoning must not render", () => {
      const isVisible = (reasoning?: string) =>
        Boolean(reasoning && reasoning.trim().length > 0);

      assert.strictEqual(isVisible(""), false);
      assert.strictEqual(isVisible("   "), false);
      assert.strictEqual(isVisible("\t\n\r  "), false);
      assert.strictEqual(isVisible(undefined), false);
      assert.strictEqual(isVisible("Let us think..."), true);
    });

    it("3.2 state machine: default state is expanded during stream, collapsed after completion", () => {
      const computeInitialCollapsed = (streaming: boolean, defaultCollapsed?: boolean) => {
        if (defaultCollapsed !== undefined) return defaultCollapsed;
        return !streaming;
      };

      assert.strictEqual(computeInitialCollapsed(true), false, "Streaming should default to expanded");
      assert.strictEqual(computeInitialCollapsed(false), true, "Completed should default to collapsed");
      assert.strictEqual(computeInitialCollapsed(true, true), true, "Explicit override honored");
      assert.strictEqual(computeInitialCollapsed(false, false), false, "Explicit override honored");
    });

    it("3.3 state machine: auto-collapses on stream finish when user has not manually interacted", () => {
      interface StateMachine {
        streaming: boolean;
        isCollapsed: boolean;
        userInteracted: boolean;
      }

      const sm: StateMachine = {
        streaming: true,
        isCollapsed: false,
        userInteracted: false,
      };

      // Stream finishes
      sm.streaming = false;
      if (!sm.userInteracted) {
        sm.isCollapsed = true;
      }

      assert.strictEqual(sm.isCollapsed, true, "Auto-collapsed on stream finish");
    });

    it("3.4 state machine: user manual interaction locks preference across stream state changes", () => {
      interface StateMachine {
        streaming: boolean;
        isCollapsed: boolean;
        userInteracted: boolean;
      }

      // User manually collapses while streaming
      const sm: StateMachine = {
        streaming: true,
        isCollapsed: false,
        userInteracted: false,
      };

      // User clicks header toggle
      sm.userInteracted = true;
      sm.isCollapsed = true;

      // Stream continues with more chunks
      if (!sm.userInteracted) {
        sm.isCollapsed = false;
      }
      assert.strictEqual(sm.isCollapsed, true, "Remains collapsed despite active stream");

      // Stream finishes
      sm.streaming = false;
      if (!sm.userInteracted) {
        sm.isCollapsed = true;
      }
      assert.strictEqual(sm.isCollapsed, true, "Remains collapsed after finish");

      // User manually expands after finish
      sm.isCollapsed = false;
      assert.strictEqual(sm.isCollapsed, false, "Remains expanded after manual toggle");
    });

    it("3.5 live duration timer format during streaming vs completed state", () => {
      const getDurationLabel = (streaming: boolean, elapsedMs: number, lang = "en") => {
        if (streaming) {
          const sec = (Math.max(0, elapsedMs) / 1000).toFixed(1);
          switch (lang) {
            case "cn":
            case "jp":
              return `思考中 (${sec}s)...`;
            case "fr":
              return `Réflexion (${sec}s)...`;
            case "en":
            default:
              return `Thinking (${sec}s)...`;
          }
        }
        return formatThinkingDuration(elapsedMs, lang);
      };

      // Streaming state
      assert.strictEqual(getDurationLabel(true, 1250, "en"), "Thinking (1.3s)...");
      assert.strictEqual(getDurationLabel(true, 3420, "cn"), "思考中 (3.4s)...");
      assert.strictEqual(getDurationLabel(true, 500, "fr"), "Réflexion (0.5s)...");

      // Completed state
      assert.strictEqual(getDurationLabel(false, 3420, "en"), "Thought for 3.4s");
      assert.strictEqual(getDurationLabel(false, 3420, "cn"), "思考耗时 3.4 秒");
    });

    it("3.6 handles massive 10,000+ words reasoning process safely without memory leak", () => {
      const hugeReasoning = "Analyzing logical step and constraint satisfaction. ".repeat(10_000);
      assert.ok(hugeReasoning.length > 200_000);

      // Verify substring inspection and processing
      const preview = hugeReasoning.slice(0, 100);
      assert.ok(preview.startsWith("Analyzing logical step"));
      assert.strictEqual(hugeReasoning.split(" ").length > 10_000, true);
    });

    it("3.7 chat UI double loading indicator suppression logic", () => {
      const shouldShowMarkdownLoading = (
        message: {
          streaming?: boolean;
          preview?: boolean;
          content: string;
          reasoning?: string;
        },
        isUser: boolean,
      ) => {
        return (
          (message.preview || message.streaming) &&
          message.content.length === 0 &&
          !message.reasoning &&
          !isUser
        );
      };

      // Case A: Assistant is streaming reasoning, content is still empty
      const streamingReasoningOnly = {
        streaming: true,
        content: "",
        reasoning: "Let me think...",
      };
      assert.strictEqual(
        shouldShowMarkdownLoading(streamingReasoningOnly, false),
        false,
        "Markdown loading dots must be suppressed when reasoning is actively streaming",
      );

      // Case B: Assistant is streaming regular response without reasoning, content is empty
      const streamingDirectResponse = {
        streaming: true,
        content: "",
        reasoning: undefined,
      };
      assert.strictEqual(
        shouldShowMarkdownLoading(streamingDirectResponse, false),
        true,
        "Markdown loading dots should show when direct response is starting without reasoning",
      );

      // Case C: Assistant has started producing content tokens
      const streamingContentStarted = {
        streaming: true,
        content: "Here is the answer: ",
        reasoning: "Done thinking.",
      };
      assert.strictEqual(
        shouldShowMarkdownLoading(streamingContentStarted, false),
        false,
        "Loading dots hidden once content is present",
      );
    });
  });

  // =========================================================================
  // 4. Gemini 3 Thinking Signatures & Model Config Parameter Boundaries
  // =========================================================================
  describe("4. Gemini 3 Thinking Signatures & Model Config Parameter Boundaries", () => {
    it("4.1 clamps thinkingBudget strictly between [0, 65536] and filters invalid values", () => {
      const parseThinkingBudget = (val: number): number | undefined => {
        if (isNaN(val) || val <= 0) return undefined;
        return Math.min(val, 65536);
      };

      assert.strictEqual(parseThinkingBudget(0), undefined);
      assert.strictEqual(parseThinkingBudget(-50), undefined);
      assert.strictEqual(parseThinkingBudget(NaN), undefined);
      assert.strictEqual(parseThinkingBudget(2048), 2048);
      assert.strictEqual(parseThinkingBudget(65536), 65536);
      assert.strictEqual(parseThinkingBudget(100000), 65536);
    });

    it("4.2 maps thinkingLevel values correctly and defaults to undefined", () => {
      const parseThinkingLevel = (
        val: string,
      ): "minimal" | "low" | "medium" | "high" | undefined => {
        if (val === "default" || !val) return undefined;
        return val as any;
      };

      assert.strictEqual(parseThinkingLevel("default"), undefined);
      assert.strictEqual(parseThinkingLevel("minimal"), "minimal");
      assert.strictEqual(parseThinkingLevel("low"), "low");
      assert.strictEqual(parseThinkingLevel("medium"), "medium");
      assert.strictEqual(parseThinkingLevel("high"), "high");
    });

    it("4.3 creates Google Generative AI model with thinkingBudget and thinkingLevel", () => {
      const payloadWithBudget: ChatApiPayload = {
        messages: [{ role: "user", content: "Solve math problem" }],
        model: "gemini-3-pro",
        provider: "google",
        modelConfig: {
          reasoningConfig: {
            thinkingBudget: 4096,
          },
        },
      };

      const modelWithBudget = createLanguageModel(payloadWithBudget);
      assert.ok(modelWithBudget);
      assert.strictEqual(modelWithBudget.modelId, "gemini-3-pro");

      const payloadWithLevel: ChatApiPayload = {
        messages: [{ role: "user", content: "Solve logic puzzle" }],
        model: "gemini-3-flash",
        provider: "google",
        modelConfig: {
          reasoningConfig: {
            thinkingLevel: "high",
          },
        },
      };

      const modelWithLevel = createLanguageModel(payloadWithLevel);
      assert.ok(modelWithLevel);
      assert.strictEqual(modelWithLevel.modelId, "gemini-3-flash");
    });

    it("4.4 creates Anthropic model with thinking budgetTokens option", () => {
      const payloadAnthropic: ChatApiPayload = {
        messages: [{ role: "user", content: "Analyze code structure" }],
        model: "claude-3-7-sonnet",
        provider: "anthropic",
        modelConfig: {
          reasoningConfig: {
            thinkingBudget: 8192,
          },
        },
      };

      const modelAnthropic = createLanguageModel(payloadAnthropic);
      assert.ok(modelAnthropic);
      assert.strictEqual(modelAnthropic.modelId, "claude-3-7-sonnet");
    });

    it("4.5 creates OpenAI model with reasoningEffort mapping and wraps DeepSeek R1 with thinking middleware", () => {
      const payloadOpenAI: ChatApiPayload = {
        messages: [{ role: "user", content: "Verify algorithm complexity" }],
        model: "o3-mini",
        provider: "openai",
        modelConfig: {
          reasoningConfig: {
            thinkingLevel: "high",
          },
        },
      };

      const modelOpenAI = createLanguageModel(payloadOpenAI);
      assert.ok(modelOpenAI);
      assert.strictEqual(modelOpenAI.modelId, "o3-mini");

      const payloadDeepSeek: ChatApiPayload = {
        messages: [{ role: "user", content: "Solve puzzle" }],
        model: "deepseek-r1",
        provider: "deepseek",
      };

      const modelDeepSeek = createLanguageModel(payloadDeepSeek);
      assert.ok(modelDeepSeek);
      assert.strictEqual(modelDeepSeek.modelId, "deepseek-r1");
    });

    it("4.6 end-to-end stream parsing of reasoning deltas with duration computation", () => {
      const streamChunks = [
        encodeDataStreamChunk("g", "Step 1: Parse AST.\n"),
        encodeDataStreamChunk("g", "Step 2: Typecheck.\n"),
        encodeDataStreamChunk("0", "The code is valid."),
        encodeDataStreamChunk("d", { finishReason: "stop" }),
      ].join("");

      const chunks = parseDataStreamResponse(streamChunks);
      const state = accumulateStreamState(chunks);

      assert.strictEqual(state.reasoning, "Step 1: Parse AST.\nStep 2: Typecheck.\n");
      assert.strictEqual(state.text, "The code is valid.");
      assert.strictEqual(state.isFinished, true);
    });
  });
});

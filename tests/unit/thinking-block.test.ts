import {
  formatThinkingDuration,
  extractPlainText,
} from "@/utils/thinking";

describe("ThinkingBlock Utilities", () => {
  describe("formatThinkingDuration", () => {
    test("formats 0ms and negative values gracefully", () => {
      expect(formatThinkingDuration(0)).toBe("Thought for 0.0s");
      expect(formatThinkingDuration(-500)).toBe("Thought for 0.0s");
      expect(formatThinkingDuration(-3600_000)).toBe("Thought for 0.0s");
    });

    test("formats sub-second durations", () => {
      expect(formatThinkingDuration(49)).toBe("Thought for 0.0s");
      expect(formatThinkingDuration(50)).toBe("Thought for 0.1s");
      expect(formatThinkingDuration(250)).toBe("Thought for 0.3s");
      expect(formatThinkingDuration(400)).toBe("Thought for 0.4s");
      expect(formatThinkingDuration(960)).toBe("Thought for 1.0s");
    });

    test("formats standard second ranges", () => {
      expect(formatThinkingDuration(1000)).toBe("Thought for 1.0s");
      expect(formatThinkingDuration(3420)).toBe("Thought for 3.4s");
      expect(formatThinkingDuration(5200)).toBe("Thought for 5.2s");
      expect(formatThinkingDuration(45200)).toBe("Thought for 45.2s");
      expect(formatThinkingDuration(65400)).toBe("Thought for 65.4s");
      expect(formatThinkingDuration(3599900)).toBe("Thought for 3599.9s");
    });

    test("formats hours range for >= 1 hour", () => {
      expect(formatThinkingDuration(3600_000)).toBe("Thought for 1.0h");
      expect(formatThinkingDuration(5400_000)).toBe("Thought for 1.5h");
      expect(formatThinkingDuration(7200_000)).toBe("Thought for 2.0h");
      expect(formatThinkingDuration(86400_000)).toBe("Thought for 24.0h");
    });

    test("supports localization in cn, jp, fr, en and unknown fallbacks", () => {
      expect(formatThinkingDuration(3400, "en")).toBe("Thought for 3.4s");
      expect(formatThinkingDuration(3400, "cn")).toBe("思考耗时 3.4 秒");
      expect(formatThinkingDuration(3400, "jp")).toBe("思考時間 3.4 秒");
      expect(formatThinkingDuration(3400, "fr")).toBe("Pensé pendant 3.4s");

      expect(formatThinkingDuration(7200_000, "cn")).toBe("思考耗时 2.0 小时");
      expect(formatThinkingDuration(7200_000, "jp")).toBe("思考時間 2.0 時間");
      expect(formatThinkingDuration(7200_000, "fr")).toBe("Pensé pendant 2.0h");

      // Unknown locales fallback to en
      expect(formatThinkingDuration(3400, "de")).toBe("Thought for 3.4s");
      expect(formatThinkingDuration(3400, "es")).toBe("Thought for 3.4s");
    });
  });

  describe("extractPlainText", () => {
    test("handles empty, whitespace or falsy reasoning text", () => {
      expect(extractPlainText("")).toBe("");
      expect(extractPlainText("   ")).toBe("");
      expect(extractPlainText(undefined as any)).toBe("");
      expect(extractPlainText(null as any)).toBe("");
    });

    test("strips markdown code blocks with and without language specifiers", () => {
      const inputWithLang = "```ts\nconst a = 1;\n```";
      expect(extractPlainText(inputWithLang)).toBe("const a = 1;");

      const inputWithoutLang = "```\nraw text inside code block\n```";
      expect(extractPlainText(inputWithoutLang)).toBe("raw text inside code block");

      const pythonInput = "```python\ndef run():\n    return True\n```";
      expect(extractPlainText(pythonInput)).toBe("def run():\n    return True");
    });

    test("strips inline LaTeX dollar delimiters", () => {
      const input = "Let $x = 10$ and $y = 20$.";
      expect(extractPlainText(input)).toBe("Let x = 10 and y = 20.");
    });

    test("extracts clean plain text from complex mixed reasoning markdown", () => {
      const input =
        "Let $x = 10$.\n```ts\nconst y = x * 2;\n```\nResult is 20.";
      const result = extractPlainText(input);

      expect(result).toContain("Let x = 10.");
      expect(result).toContain("const y = x * 2;");
      expect(result).toContain("Result is 20.");
      expect(result).not.toContain("```");
      expect(result).not.toContain("$");
    });

    test("handles massive reasoning chain efficiently without hanging", () => {
      const chunk = "Step $k = 1$: compute formula.\n```ts\nconst k = 1;\n```\n";
      const huge = chunk.repeat(1000);
      const start = performance.now();
      const result = extractPlainText(huge);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result).not.toContain("```");
      expect(result).not.toContain("$");
    });
  });
});

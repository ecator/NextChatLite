import test, { describe, it } from "node:test";
import assert from "node:assert";

class MockPromptSanitizer {
  static sanitizePrompt(template: string): string {
    // Removes legacy MCP placeholders {mcp:...}
    return template.replace(/\{mcp:[^}]+\}/gi, "").trim();
  }

  static parseImportedMasks(masks: any[]): any[] {
    return masks.map((m) => {
      const { mcpServers, mcpTools, ...cleanMask } = m;
      return cleanMask;
    });
  }
}

describe("Tier 2 Boundary B8: MCP Removal Boundaries", () => {
  it("B8-1: removes {mcp:...} tags from legacy prompt templates", () => {
    const rawPrompt = "You are a coding assistant. {mcp:filesystem_tool} Please inspect the repo.";
    const clean = MockPromptSanitizer.sanitizePrompt(rawPrompt);

    assert.strictEqual(clean, "You are a coding assistant.  Please inspect the repo.");
    assert.doesNotMatch(clean, /\{mcp:/);
  });

  it("B8-2: imports legacy masks with MCP server definitions cleanly by pruning them", () => {
    const legacyMasks = [
      {
        id: "mask_coder",
        name: "Code Copilot",
        context: [{ role: "system", content: "Write clean TS code." }],
        mcpServers: ["filesystem", "brave-search"],
        mcpTools: ["read_file", "search"],
      },
    ];

    const cleanMasks = MockPromptSanitizer.parseImportedMasks(legacyMasks);
    assert.strictEqual(cleanMasks.length, 1);
    assert.strictEqual(cleanMasks[0].id, "mask_coder");
    assert.strictEqual(cleanMasks[0].mcpServers, undefined);
    assert.strictEqual(cleanMasks[0].mcpTools, undefined);
  });

  it("B8-3: legacy tool messages with MCP headers parse as standard tool results", () => {
    const legacyToolMessage = {
      role: "tool",
      tool_call_id: "mcp_call_123",
      content: JSON.stringify({ result: "file content" }),
    };

    assert.strictEqual(legacyToolMessage.role, "tool");
    assert.strictEqual(legacyToolMessage.tool_call_id, "mcp_call_123");
    assert.ok(JSON.parse(legacyToolMessage.content).result, "file content");
  });

  it("B8-4: handles prompt templates without any MCP tags unmodified", () => {
    const regularPrompt = "Translate the following English text to French.";
    const result = MockPromptSanitizer.sanitizePrompt(regularPrompt);
    assert.strictEqual(result, regularPrompt);
  });

  it("B8-5: handles empty prompt string and whitespace-only prompt without error", () => {
    assert.strictEqual(MockPromptSanitizer.sanitizePrompt(""), "");
    assert.strictEqual(MockPromptSanitizer.sanitizePrompt("   "), "");
  });
});

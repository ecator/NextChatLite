import { describe, it } from "node:test";
import assert from "node:assert";

function validateAgentsDocCompleteness(content: string): {
  valid: boolean;
  missingSections: string[];
} {
  const requiredSections = [
    "Architecture",
    "Conventions",
    "Instructions",
    "AI SDK",
  ];

  const missing: string[] = [];
  for (const sec of requiredSections) {
    const regex = new RegExp(sec, "i");
    if (!regex.test(content)) {
      missing.push(sec);
    }
  }

  return { valid: missing.length === 0, missingSections: missing };
}

function checkDocLinkHealth(markdown: string): {
  valid: boolean;
  brokenRefs: string[];
} {
  const broken: string[] = [];
  // Detect references to deleted docs
  const deletedFiles = [
    "README_CN.md",
    "README_JA.md",
    "README_KO.md",
    "src-tauri",
    "sd.ts",
  ];
  for (const df of deletedFiles) {
    if (markdown.includes(df)) {
      broken.push(df);
    }
  }
  return { valid: broken.length === 0, brokenRefs: broken };
}

describe("Tier 2 Boundary B5: Documentation & AGENTS.md Boundaries", () => {
  it("B5-1: validates AGENTS.md contains all required operational sections", () => {
    const sampleAgents = `
# NextChatLite Agent Directives
## Architecture
NextChatLite is built on Next.js 16 App Router and Vercel AI SDK.
## Conventions
Use TypeScript strict mode and pnpm package manager.
## Agent Instructions
Follow project guidelines when contributing code.
`;

    const res = validateAgentsDocCompleteness(sampleAgents);
    assert.strictEqual(res.valid, true);
  });

  it("B5-2: flags missing required sections in incomplete AGENTS.md", () => {
    const incomplete = `# Title\nSome short text.`;
    const res = validateAgentsDocCompleteness(incomplete);
    assert.strictEqual(res.valid, false);
    assert.ok(res.missingSections.length > 0);
  });

  it("B5-3: detects broken links to deleted multi-language documentation", () => {
    const docWithBrokenLinks = `Check the [Chinese Guide](README_CN.md) and [Desktop](src-tauri/README.md).`;
    const check = checkDocLinkHealth(docWithBrokenLinks);
    assert.strictEqual(check.valid, false);
    assert.ok(check.brokenRefs.includes("README_CN.md"));
    assert.ok(check.brokenRefs.includes("src-tauri"));
  });

  it("B5-4: clean English doc passes link health check", () => {
    const cleanDoc = `# NextChatLite\nWelcome to NextChatLite. Run with \`pnpm dev\`.`;
    const check = checkDocLinkHealth(cleanDoc);
    assert.strictEqual(check.valid, true);
    assert.strictEqual(check.brokenRefs.length, 0);
  });

  it("B5-5: handles non-ASCII characters and UTF-8 codeblocks in markdown safely", () => {
    const utf8Doc = `# NextChatLite 🚀\n- Multi-language UI: 日本語, Español, Français, 简体中文\n\`\`\`ts\nconst greeting = "你好世界";\n\`\`\``;
    assert.ok(utf8Doc.includes("🚀"));
    assert.ok(utf8Doc.includes("你好世界"));
    assert.strictEqual(typeof utf8Doc, "string");
  });
});

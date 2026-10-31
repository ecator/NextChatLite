import test, { describe, it } from "node:test";
import assert from "node:assert";
import { readProjectFile, fileExists } from "../fixtures/test_helpers";

describe("Feature F5: Documentation Unification & Root AGENTS.md", () => {
  it("F5-1: verifies presence of root AGENTS.md", () => {
    assert.ok(
      fileExists("AGENTS.md"),
      "AGENTS.md must exist at repository root"
    );
  });

  it("F5-2: verifies AGENTS.md specifies architecture conventions and AI SDK guidelines", () => {
    const agentsContent = readProjectFile("AGENTS.md");
    assert.ok(
      agentsContent.length > 100,
      "AGENTS.md should contain detailed project instructions"
    );
    assert.match(
      agentsContent,
      /NextChatLite|Next\.js|AI SDK|models\.dev/i,
      "AGENTS.md should document NextChatLite architecture and AI stack"
    );
  });

  it("F5-3: verifies multi-language READMEs are pruned", () => {
    assert.strictEqual(
      fileExists("README_CN.md"),
      false,
      "README_CN.md must be removed"
    );
    assert.strictEqual(
      fileExists("README_JA.md"),
      false,
      "README_JA.md must be removed"
    );
    assert.strictEqual(
      fileExists("README_KO.md"),
      false,
      "README_KO.md must be removed"
    );
  });

  it("F5-4: verifies primary README.md is in English", () => {
    assert.ok(fileExists("README.md"), "README.md must exist");
    const readmeContent = readProjectFile("README.md");
    assert.match(
      readmeContent,
      /# NextChat|# NextChatLite/i,
      "README.md must be the unified English documentation"
    );
  });

  it("F5-5: verifies documentation references pnpm instead of yarn", () => {
    const readmeContent = readProjectFile("README.md");
    assert.doesNotMatch(
      readmeContent,
      /yarn dev|yarn build|yarn install/i,
      "README.md should not instruct users to use yarn commands"
    );
  });
});

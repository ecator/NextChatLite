import test, { describe, it } from "node:test";
import assert from "node:assert";
import { directoryExists, fileExists, readJsonFile, readProjectFile } from "../fixtures/test_helpers";

describe("Feature F8: Model Context Protocol (MCP) Stripping", () => {
  it("F8-1: verifies complete absence of app/mcp/ directory", () => {
    assert.strictEqual(
      directoryExists("app/mcp"),
      false,
      "app/mcp directory must be deleted"
    );
  });

  it("F8-2: verifies removal of @modelcontextprotocol/sdk from package.json", () => {
    const pkg = readJsonFile("package.json");
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.strictEqual(
      allDeps["@modelcontextprotocol/sdk"],
      undefined,
      "@modelcontextprotocol/sdk dependency must be pruned"
    );
  });

  it("F8-3: verifies absence of MCP Market UI components (mcp-market.tsx)", () => {
    assert.strictEqual(
      fileExists("src/components/mcp-market.tsx"),
      false,
      "src/components/mcp-market.tsx must be deleted"
    );
    assert.strictEqual(
      fileExists("src/components/mcp-market.module.scss"),
      false,
      "src/components/mcp-market.module.scss must be deleted"
    );
  });

  it("F8-4: verifies absence of legacy MCP unit tests", () => {
    assert.strictEqual(
      fileExists("test/extract-mcp-json.test.ts"),
      false,
      "test/extract-mcp-json.test.ts should be removed"
    );
    assert.strictEqual(
      fileExists("test/is-mcp-json.test.ts"),
      false,
      "test/is-mcp-json.test.ts should be removed"
    );
  });

  it("F8-5: verifies prompt and plugin system operates purely on OpenAPI plugins without MCP", () => {
    if (fileExists("src/store/plugin.ts")) {
      const pluginStoreContent = readProjectFile("src/store/plugin.ts");
      assert.doesNotMatch(
        pluginStoreContent,
        /from "@modelcontextprotocol|MCPClient|mcpServer/i,
        "Plugin store must not reference Model Context Protocol"
      );
    }
  });
});

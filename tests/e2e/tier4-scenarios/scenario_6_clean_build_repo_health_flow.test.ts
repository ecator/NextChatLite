import { describe, it } from "node:test";
import assert from "node:assert";
import {
  readJsonFile,
  fileExists,
  directoryExists,
} from "../fixtures/test_helpers";

describe("Tier 4 Scenario 6: Clean Installation & Repository Platform Health Flow", () => {
  it("verifies repository cleanliness across all platform constraints", () => {
    // 1. Check package.json packageManager is pnpm
    const pkg = readJsonFile("package.json");
    assert.match(pkg.packageManager, /^pnpm@/);

    // 2. Check no Tauri desktop artifacts remain
    assert.strictEqual(directoryExists("src-tauri"), false);
    assert.strictEqual(pkg.dependencies?.["@tauri-apps/api"], undefined);
    assert.strictEqual(pkg.devDependencies?.["@tauri-apps/cli"], undefined);

    // 3. Check no Stable Diffusion artifacts remain
    assert.strictEqual(directoryExists("src/components/sd"), false);
    assert.strictEqual(fileExists("src/store/sd.ts"), false);

    // 4. Check no Model Context Protocol artifacts remain
    assert.strictEqual(directoryExists("app/mcp"), false);
    assert.strictEqual(
      pkg.dependencies?.["@modelcontextprotocol/sdk"],
      undefined,
    );

    // 5. Check AGENTS.md and English README
    assert.ok(fileExists("AGENTS.md"));
    assert.ok(fileExists("README.md"));
    assert.strictEqual(fileExists("README_CN.md"), false);

    // 6. Check all 20 runtime locales are intact
    const expectedLocales = [
      "ar",
      "bn",
      "cn",
      "cs",
      "da",
      "de",
      "en",
      "es",
      "fr",
      "id",
      "it",
      "jp",
      "ko",
      "no",
      "pt",
      "ru",
      "sk",
      "tr",
      "tw",
      "vi",
    ];
    for (const loc of expectedLocales) {
      assert.ok(fileExists(`src/locales/${loc}.ts`));
    }
  });
});

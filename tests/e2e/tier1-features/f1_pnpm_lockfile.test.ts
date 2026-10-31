import test, { describe, it } from "node:test";
import assert from "node:assert";
import { readJsonFile, fileExists, readProjectFile } from "../fixtures/test_helpers";

describe("Feature F1: pnpm Package Manager & Lockfile Specification", () => {
  it("F1-1: verifies packageManager field targets pnpm in package.json", () => {
    const pkg = readJsonFile("package.json");
    assert.ok(pkg.packageManager, "packageManager field must be defined in package.json");
    assert.match(
      pkg.packageManager,
      /^pnpm@/,
      `Expected packageManager to specify pnpm, got: ${pkg.packageManager}`
    );
  });

  it("F1-2: verifies npm scripts use pnpm instead of yarn", () => {
    const pkg = readJsonFile("package.json");
    assert.ok(pkg.scripts, "scripts field must exist in package.json");

    for (const [scriptName, scriptCmd] of Object.entries<string>(pkg.scripts)) {
      assert.doesNotMatch(
        scriptCmd,
        /\byarn\b/,
        `Script "${scriptName}" should not use yarn: ${scriptCmd}`
      );
    }
  });

  it("F1-3: verifies pnpm-lock.yaml exists and yarn.lock is pruned", () => {
    assert.ok(
      fileExists("pnpm-lock.yaml"),
      "pnpm-lock.yaml must exist at the project root"
    );
    assert.ok(
      !fileExists("yarn.lock"),
      "yarn.lock must be removed in favor of pnpm-lock.yaml"
    );
  });

  it("F1-4: verifies mask and build scripts invoke pnpm tsx cleanly", () => {
    const pkg = readJsonFile("package.json");
    assert.ok(pkg.scripts.mask, "mask script must exist");
    assert.match(pkg.scripts.mask, /tsx\s+(app|src)\/masks\/build\.ts/, "mask script must invoke mask builder");
    assert.ok(pkg.scripts.build, "build script must exist");
    assert.doesNotMatch(pkg.scripts.build, /yarn/, "build script must not invoke yarn");
  });

  it("F1-5: verifies test:e2e script is configured for automated test verification", () => {
    const pkg = readJsonFile("package.json");
    assert.ok(
      pkg.scripts["test:e2e"] || pkg.scripts["test"],
      "test:e2e or test script must be present in package.json"
    );
  });
});

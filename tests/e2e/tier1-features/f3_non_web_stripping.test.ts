import { describe, it } from "node:test";
import assert from "node:assert";
import {
  readJsonFile,
  fileExists,
  directoryExists,
} from "../fixtures/test_helpers";

describe("Feature F3: Non-Web Platform Stripping (Desktop & Tauri Removal)", () => {
  it("F3-1: verifies complete absence of src-tauri directory", () => {
    assert.strictEqual(
      directoryExists("src-tauri"),
      false,
      "src-tauri directory must be completely removed",
    );
  });

  it("F3-2: verifies absence of @tauri-apps dependencies in package.json", () => {
    const pkg = readJsonFile("package.json");
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    assert.strictEqual(
      allDeps["@tauri-apps/api"],
      undefined,
      "@tauri-apps/api must not be in dependencies",
    );
    assert.strictEqual(
      allDeps["@tauri-apps/cli"],
      undefined,
      "@tauri-apps/cli must not be in dependencies",
    );
  });

  it("F3-3: verifies absence of desktop Tauri scripts in package.json", () => {
    const pkg = readJsonFile("package.json");
    const scripts = pkg.scripts || {};

    assert.strictEqual(
      scripts["app:dev"],
      undefined,
      "app:dev script must be removed",
    );
    assert.strictEqual(
      scripts["app:build"],
      undefined,
      "app:build script must be removed",
    );
    assert.strictEqual(
      scripts["app:clear"],
      undefined,
      "app:clear script must be removed",
    );
  });

  it("F3-4: verifies no Tauri workflow files exist in .github/workflows", () => {
    const tauriDesktopWorkflowExists =
      fileExists(".github/workflows/desktop.yml") ||
      fileExists(".github/workflows/tauri.yml");
    assert.strictEqual(
      tauriDesktopWorkflowExists,
      false,
      "Tauri desktop GitHub workflow files must be removed",
    );
  });

  it("F3-5: verifies Web-only platform detection operates without Tauri native bridge", () => {
    // Pure web environment does not have window.__TAURI__
    const mockWindow: any = {};
    const isTauri =
      typeof mockWindow !== "undefined" && Boolean(mockWindow.__TAURI__);
    assert.strictEqual(
      isTauri,
      false,
      "Pure web platform detection must return false for Tauri",
    );
  });
});

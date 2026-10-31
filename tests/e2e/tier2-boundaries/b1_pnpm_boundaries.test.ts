import test, { describe, it } from "node:test";
import assert from "node:assert";

function validatePackageManagerSpec(spec?: string): { valid: boolean; error?: string } {
  if (!spec || typeof spec !== "string") {
    return { valid: false, error: "Missing or invalid packageManager string" };
  }
  const match = spec.match(/^pnpm@(\d+\.\d+\.\d+(?:-[\w.]+)?)$/);
  if (!match) {
    return { valid: false, error: `Invalid pnpm spec format: ${spec}` };
  }
  return { valid: true };
}

function detectHiddenYarnInvocations(scripts: Record<string, string>): string[] {
  const violations: string[] = [];
  const yarnPattern = /(?:^|[;&|`$()\s])yarn(?:\s+[a-z0-9_:-]+|\s*$)/i;

  for (const [name, cmd] of Object.entries(scripts)) {
    if (yarnPattern.test(cmd)) {
      violations.push(`${name}: "${cmd}"`);
    }
  }
  return violations;
}

describe("Tier 2 Boundary B1: pnpm & Package Specification Boundaries", () => {
  it("B1-1: rejects malformed or legacy yarn packageManager strings", () => {
    assert.strictEqual(validatePackageManagerSpec("yarn@1.22.19").valid, false);
    assert.strictEqual(validatePackageManagerSpec("npm@10.0.0").valid, false);
    assert.strictEqual(validatePackageManagerSpec("pnpm").valid, false);
    assert.strictEqual(validatePackageManagerSpec("pnpm@").valid, false);
    assert.strictEqual(validatePackageManagerSpec(undefined).valid, false);
    assert.strictEqual(validatePackageManagerSpec("pnpm@9.15.0").valid, true);
    assert.strictEqual(validatePackageManagerSpec("pnpm@10.0.0-rc.1").valid, true);
  });

  it("B1-2: detects hidden and nested yarn invocations in chained scripts", () => {
    const scriptsWithHiddenYarn = {
      build: "pnpm mask && cross-env yarn next build",
      test: "node --test $(yarn bin jest)",
      dev: "concurrently -r \"pnpm mask:watch\" \"next dev\"",
      clean: "rimraf node_modules && (yarn cache clean || true)",
    };

    const violations = detectHiddenYarnInvocations(scriptsWithHiddenYarn);
    assert.strictEqual(violations.length, 3);
    assert.ok(violations.some((v) => v.includes("build")));
    assert.ok(violations.some((v) => v.includes("test")));
    assert.ok(violations.some((v) => v.includes("clean")));
  });

  it("B1-3: handles empty or missing scripts object without throw", () => {
    const violationsEmpty = detectHiddenYarnInvocations({});
    assert.strictEqual(violationsEmpty.length, 0);
  });

  it("B1-4: validates lockfile conflict resolution boundary", () => {
    const checkLockfileHygiene = (files: string[]) => {
      const hasYarn = files.includes("yarn.lock");
      const hasPnpm = files.includes("pnpm-lock.yaml");
      if (hasYarn && hasPnpm) return "CONFLICT_DUAL_LOCKFILE";
      if (!hasPnpm) return "MISSING_PNPM_LOCKFILE";
      return "OK";
    };

    assert.strictEqual(checkLockfileHygiene(["yarn.lock", "pnpm-lock.yaml"]), "CONFLICT_DUAL_LOCKFILE");
    assert.strictEqual(checkLockfileHygiene(["yarn.lock"]), "MISSING_PNPM_LOCKFILE");
    assert.strictEqual(checkLockfileHygiene(["pnpm-lock.yaml"]), "OK");
  });

  it("B1-5: handles exotic dependency version specifiers in package.json", () => {
    const validateDepSpecifier = (spec: string): boolean => {
      // Must not use deprecated yarn-specific link formats
      return !spec.startsWith("link:../") && spec.length > 0;
    };

    assert.strictEqual(validateDepSpecifier("^18.2.0"), true);
    assert.strictEqual(validateDepSpecifier("workspace:*"), true);
    assert.strictEqual(validateDepSpecifier("npm:@opencode-ai/models@^1.0.0"), true);
    assert.strictEqual(validateDepSpecifier("link:../invalid-relative"), false);
  });
});

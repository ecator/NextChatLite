import test, { describe, it } from "node:test";
import assert from "node:assert";
import { readJsonFile, fileExists, readProjectFile } from "../fixtures/test_helpers";

describe("Feature F2: Next.js 16+ & React 19 App Router Modernization", () => {
  it("F2-1: verifies Next.js dependency is version 16+", () => {
    const pkg = readJsonFile("package.json");
    const nextVer = pkg.dependencies?.next || pkg.devDependencies?.next;
    assert.ok(nextVer, "next dependency must be present");
    // match ^16 or >=16 or similar 16.x specification
    const isNext16OrHigher = nextVer.includes("16") || /^[~^]?(1[6-9]|[2-9]\d)/.test(nextVer);
    assert.ok(isNext16OrHigher, `Expected Next.js 16+, found: ${nextVer}`);
  });

  it("F2-2: verifies React and React-DOM are upgraded to React 19", () => {
    const pkg = readJsonFile("package.json");
    const reactVer = pkg.dependencies?.react;
    const reactDomVer = pkg.dependencies?.["react-dom"];
    assert.ok(reactVer, "react dependency must be present");
    assert.ok(reactDomVer, "react-dom dependency must be present");

    const isReact19 = reactVer.includes("19") || /^[~^]?(19|[2-9]\d)/.test(reactVer);
    assert.ok(isReact19, `Expected React 19, found: ${reactVer}`);
  });

  it("F2-3: verifies App Router root layout and page structure exist", () => {
    assert.ok(fileExists("app/layout.tsx"), "app/layout.tsx must exist for App Router");
    assert.ok(fileExists("app/page.tsx"), "app/page.tsx must exist for App Router root page");
  });

  it("F2-4: verifies next.config.mjs configuration is present and modern", () => {
    assert.ok(fileExists("next.config.mjs"), "next.config.mjs must exist");
    const configContent = readProjectFile("next.config.mjs");
    assert.ok(configContent.includes("nextConfig"), "next.config.mjs should export nextConfig");
  });

  it("F2-5: verifies server-rendered API routes structure for chat and config", () => {
    assert.ok(
      fileExists("app/api/chat/route.ts") || fileExists("app/api/config/route.ts") || fileExists("app/api/common.ts"),
      "App Router API routes or route handlers must be present"
    );
  });
});

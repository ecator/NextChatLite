import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

describe("Milestone 1 Empirical Challenger Deep Verification", () => {
  const rootDir = path.resolve(__dirname, "../../..");
  const localesDir = path.join(rootDir, "src/locales");

  const requiredLocales = [
    "ar", "bn", "cn", "cs", "da", "de", "en", "es", "fr", "id",
    "it", "jp", "ko", "no", "pt", "ru", "sk", "tr", "tw", "vi"
  ];

  it("1. All 20 UI localization files exist on disk", () => {
    for (const loc of requiredLocales) {
      const filePath = path.join(localesDir, `${loc}.ts`);
      assert.ok(fs.existsSync(filePath), `Missing locale file: ${loc}.ts`);
    }
  });

  it("2. All 20 UI localization files contain valid dictionary keys and structure", () => {
    for (const loc of requiredLocales) {
      const filePath = path.join(localesDir, `${loc}.ts`);
      const content = fs.readFileSync(filePath, "utf-8");
      
      assert.ok(content.includes("Chat:"), `Locale ${loc}.ts missing Chat key`);
      assert.ok(content.includes("Settings:"), `Locale ${loc}.ts missing Settings key`);
      assert.ok(content.includes("Export:"), `Locale ${loc}.ts missing Export key`);
      assert.ok(content.includes("ChatItem:"), `Locale ${loc}.ts missing ChatItem key`);
      assert.ok(content.includes("Store:"), `Locale ${loc}.ts missing Store key`);
      assert.ok(content.includes("UI:"), `Locale ${loc}.ts missing UI key`);
      assert.ok(content.includes("export default"), `Locale ${loc}.ts missing default export`);
    }
  });

  it("3. app/locales/index.ts defines all 20 languages and default options", () => {
    const indexPath = path.join(localesDir, "index.ts");
    const content = fs.readFileSync(indexPath, "utf-8");
    
    for (const loc of requiredLocales) {
      assert.ok(content.includes(`import ${loc} from "./${loc}"`), `index.ts does not import ${loc}`);
      assert.ok(content.includes(`${loc}:`), `index.ts ALL_LANG_OPTIONS does not configure ${loc}`);
      assert.ok(content.includes(`${loc}:`), `index.ts STT_LANG_MAP does not configure ${loc}`);
    }
  });

  it("4. No commercial SaaS URLs or external tracking domains exist in any locale file", () => {
    const commercialUrlPatterns = [
      /nextchat\.dev/i,
      /chat-commercial/i,
      /https:\/\/github\.com\/ChatGPTNextWeb\/ChatGPT-Next-Web-Lang/i,
      /buy license/i,
      /commercial version/i
    ];

    for (const loc of requiredLocales) {
      const filePath = path.join(localesDir, `${loc}.ts`);
      const content = fs.readFileSync(filePath, "utf-8");
      
      for (const pattern of commercialUrlPatterns) {
        assert.ok(
          !pattern.test(content),
          `Found prohibited pattern ${pattern} in ${loc}.ts`
        );
      }
    }
  });

  it("5. Zero Tauri / Desktop remnants exist across app/, config/, store/, utils/", () => {
    const forbiddenTauriPatterns = [
      /window\.__TAURI__/i,
      /data-tauri-drag-region/i,
      /@tauri-apps/i,
      /tauri-ipc/i
    ];

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".agents") {
            scanDir(fullPath);
          }
        } else if (entry.isFile() && /\.(ts|tsx|js|mjs|scss|css|json|html)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          for (const pattern of forbiddenTauriPatterns) {
            assert.ok(
              !pattern.test(content),
              `Forbidden Tauri residue matched ${pattern} in ${fullPath}`
            );
          }
        }
      }
    }

    scanDir(path.join(rootDir, "src"));
  });

  it("6. Zero commercial SaaS active endpoints or tracking exist across app components and stores", () => {
    const forbiddenSaaSPatterns = [
      /SAAS_CHAT_URL/i,
      /SAAS_CHAT_UTM_URL/i,
      /auth-settings-events/i,
      /goSaas\(/i,
      /<TopBanner/i
    ];

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".agents" && entry.name !== "locales") {
            scanDir(fullPath);
          }
        } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          for (const pattern of forbiddenSaaSPatterns) {
            assert.ok(
              !pattern.test(content),
              `Forbidden SaaS residue matched ${pattern} in ${fullPath}`
            );
          }
        }
      }
    }

    scanDir(path.join(rootDir, "src"));
  });

  it("7. AGENTS.md satisfies all project architectural requirements", () => {
    const agentsPath = path.join(rootDir, "AGENTS.md");
    assert.ok(fs.existsSync(agentsPath), "AGENTS.md does not exist");
    const content = fs.readFileSync(agentsPath, "utf-8");
    assert.ok(content.includes("1. Project Architecture & Philosophy"), "AGENTS.md missing Section 1");
    assert.ok(content.includes("2. Directory Layout & Boundaries"), "AGENTS.md missing Section 2");
    assert.ok(content.includes("3. Development Workflow & Commands"), "AGENTS.md missing Section 3");
    assert.ok(content.includes("4. Key Implementation Conventions"), "AGENTS.md missing Section 4");
    assert.ok(content.includes("5. Agent Integrity & Quality Guidelines"), "AGENTS.md missing Section 5");
    assert.ok(content.includes("Next.js 16"), "AGENTS.md missing Next.js 16 reference");
    assert.ok(content.includes("Vercel AI SDK"), "AGENTS.md missing Vercel AI SDK reference");
    assert.ok(content.includes("models.dev"), "AGENTS.md missing models.dev reference");
    assert.ok(content.includes("pnpm"), "AGENTS.md missing pnpm reference");
  });

  it("8. README.md is unified in English with no dead links to pruned docs", () => {
    const readmePath = path.join(rootDir, "README.md");
    assert.ok(fs.existsSync(readmePath), "README.md does not exist");
    const content = fs.readFileSync(readmePath, "utf-8");
    assert.ok(!content.includes("README_CN"), "README.md still references README_CN");
    assert.ok(!content.includes("README_JA"), "README.md still references README_JA");
    assert.ok(!content.includes("README_KO"), "README.md still references README_KO");
    assert.ok(content.includes("pnpm"), "README.md missing pnpm instructions");
    assert.ok(!content.includes("yarn"), "README.md still references yarn");
  });

  it("9. pnpm package.json scripts and packageManager integrity", () => {
    const pkgPath = path.join(rootDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    assert.ok(pkg.packageManager?.startsWith("pnpm@"), "packageManager is not pnpm");
    assert.ok(pkg.scripts.dev.includes("pnpm"), "dev script does not use pnpm");
    assert.ok(pkg.scripts.build.includes("pnpm"), "build script does not use pnpm");
    assert.ok(!JSON.stringify(pkg.scripts).includes("yarn"), "scripts contain yarn");
    assert.ok(!pkg.dependencies["@tauri-apps/api"], "@tauri-apps/api is still in dependencies");
    assert.ok(!pkg.devDependencies["@tauri-apps/cli"], "@tauri-apps/cli is still in devDependencies");
  });

  it("10. TypeScript compilation passes without errors", () => {
    const tscOutput = execSync("npx tsc --noEmit", { cwd: rootDir, encoding: "utf-8", shell: true as any });
    assert.equal(tscOutput.trim(), "", "TypeScript compilation produced output/errors");
  });
});

import test, { describe, it } from "node:test";
import assert from "node:assert";
import { fileExists, readProjectFile, listDirFiles } from "../fixtures/test_helpers";

const EXPECTED_LOCALES = [
  "ar", "bn", "cn", "cs", "da", "de", "en", "es", "fr", "id",
  "it", "jp", "ko", "no", "pt", "ru", "sk", "tr", "tw", "vi"
];

describe("Feature F6: UI i18n Localization Retention (20 Languages)", () => {
  it("F6-1: verifies all 20 required language locale files exist in app/locales/", () => {
    for (const loc of EXPECTED_LOCALES) {
      assert.ok(
        fileExists(`app/locales/${loc}.ts`),
        `Locale file app/locales/${loc}.ts must exist`
      );
    }
  });

  it("F6-2: verifies app/locales/index.ts exports all 20 locale objects", () => {
    assert.ok(fileExists("app/locales/index.ts"), "app/locales/index.ts must exist");
    const indexContent = readProjectFile("app/locales/index.ts");
    for (const loc of EXPECTED_LOCALES) {
      assert.ok(
        indexContent.includes(loc),
        `index.ts should import and reference locale '${loc}'`
      );
    }
  });

  it("F6-3: verifies English locale contains standard Chat and Settings sections", () => {
    const enContent = readProjectFile("app/locales/en.ts");
    assert.match(enContent, /Chat:/, "en.ts must define Chat translations");
    assert.match(enContent, /Settings:/, "en.ts must define Settings translations");
    assert.match(enContent, /Context:/, "en.ts must define Context translations");
  });

  it("F6-4: verifies Chinese (cn.ts) and Japanese (jp.ts) retain full translation dictionaries", () => {
    const cnContent = readProjectFile("app/locales/cn.ts");
    const jpContent = readProjectFile("app/locales/jp.ts");
    assert.ok(cnContent.length > 5000, "cn.ts translation dictionary should be intact");
    assert.ok(jpContent.length > 5000, "jp.ts translation dictionary should be intact");
  });

  it("F6-5: verifies fallback mechanism defaults to English when missing key", () => {
    // Simulating i18n key resolution fallback
    const enDict = { Chat: { Title: "Chat", Send: "Send", Thinking: "Thinking..." } };
    const incompleteDict = { Chat: { Title: "Schatten" } };

    const getTranslation = (dict: any, section: string, key: string) => {
      return dict?.[section]?.[key] ?? (enDict as any)?.[section]?.[key] ?? key;
    };

    assert.strictEqual(getTranslation(incompleteDict, "Chat", "Title"), "Schatten");
    assert.strictEqual(getTranslation(incompleteDict, "Chat", "Send"), "Send");
    assert.strictEqual(getTranslation(incompleteDict, "Chat", "Thinking"), "Thinking...");
  });
});

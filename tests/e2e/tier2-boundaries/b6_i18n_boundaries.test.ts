import test, { describe, it } from "node:test";
import assert from "node:assert";

class MockI18nResolver {
  private locales: Record<string, any>;
  private defaultLocale: string;

  constructor(locales: Record<string, any>, defaultLocale = "en") {
    this.locales = locales;
    this.defaultLocale = defaultLocale;
  }

  t(locale: string, path: string, params?: Record<string, string>): string {
    const activeDict = this.locales[locale] || this.locales[this.defaultLocale] || {};
    const fallbackDict = this.locales[this.defaultLocale] || {};

    const resolvePath = (dict: any, p: string) => {
      const keys = p.split(".");
      let cur = dict;
      for (const k of keys) {
        if (!cur || typeof cur !== "object") return undefined;
        cur = cur[k];
      }
      return typeof cur === "string" ? cur : undefined;
    };

    let template = resolvePath(activeDict, path);
    if (template === undefined || template === "") {
      template = resolvePath(fallbackDict, path) ?? path;
    }

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        template = template.replaceAll(`{${k}}`, v);
      }
    }

    return template;
  }

  isRTL(locale: string): boolean {
    return ["ar", "he", "fa", "ur"].includes(locale.toLowerCase());
  }
}

describe("Tier 2 Boundary B6: UI i18n Localization Boundaries", () => {
  const mockLocales = {
    en: {
      Chat: {
        Title: "Chat",
        Welcome: "Welcome {user}!",
        Thinking: "Thinking...",
      },
    },
    cn: {
      Chat: {
        Title: "聊天",
        Welcome: "欢迎 {user}！",
        // Thinking is missing in cn to test fallback
      },
    },
    ar: {
      Chat: {
        Title: "محادثة",
      },
    },
  };

  const i18n = new MockI18nResolver(mockLocales, "en");

  it("B6-1: resolves translation in requested target locale", () => {
    assert.strictEqual(i18n.t("cn", "Chat.Title"), "聊天");
    assert.strictEqual(i18n.t("ar", "Chat.Title"), "محادثة");
    assert.strictEqual(i18n.t("en", "Chat.Title"), "Chat");
  });

  it("B6-2: falls back to English when key is missing in target locale", () => {
    // Thinking is omitted in cn
    assert.strictEqual(i18n.t("cn", "Chat.Thinking"), "Thinking...");
  });

  it("B6-3: falls back to default locale when unknown locale code is requested", () => {
    assert.strictEqual(i18n.t("unknown_lang", "Chat.Title"), "Chat");
    assert.strictEqual(i18n.t("", "Chat.Title"), "Chat");
  });

  it("B6-4: replaces interpolation parameters and handles missing param placeholders", () => {
    assert.strictEqual(i18n.t("en", "Chat.Welcome", { user: "Alice" }), "Welcome Alice!");
    assert.strictEqual(i18n.t("cn", "Chat.Welcome", { user: "张三" }), "欢迎 张三！");
    // Missing param leaves placeholder or untouched
    assert.strictEqual(i18n.t("en", "Chat.Welcome"), "Welcome {user}!");
  });

  it("B6-5: correctly identifies Right-to-Left (RTL) locales like Arabic (ar)", () => {
    assert.strictEqual(i18n.isRTL("ar"), true);
    assert.strictEqual(i18n.isRTL("en"), false);
    assert.strictEqual(i18n.isRTL("cn"), false);
    assert.strictEqual(i18n.isRTL("jp"), false);
  });
});

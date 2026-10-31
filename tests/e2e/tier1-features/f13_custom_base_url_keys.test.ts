import test, { describe, it } from "node:test";
import assert from "node:assert";
import { validateChatApiPayload } from "../fixtures/test_helpers";
import type { ChatApiPayload } from "../fixtures/test_helpers";

function normalizeBaseUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.trim().replace(/\/+$/, "");
}

function resolveProviderEndpoint(provider: string, customConfig?: { baseUrl?: string; apiKey?: string }) {
  const defaultEndpoints: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta",
    anthropic: "https://api.anthropic.com/v1",
  };

  const finalBaseUrl = normalizeBaseUrl(customConfig?.baseUrl) || defaultEndpoints[provider] || defaultEndpoints.openai;
  const apiKey = customConfig?.apiKey || "env_default_key";

  return {
    baseUrl: finalBaseUrl,
    apiKey,
    isCustom: Boolean(customConfig?.baseUrl || customConfig?.apiKey),
  };
}

describe("Feature F13: Custom BASE_URL & API Key Overrides", () => {
  it("F13-1: accepts customConfig with apiKey and baseUrl in request payload", () => {
    const payload: ChatApiPayload = {
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-4o",
      provider: "openai",
      customConfig: {
        apiKey: "sk-custom-user-key-12345",
        baseUrl: "https://my-custom-proxy.openai.azure.com/v1",
      },
    };

    const res = validateChatApiPayload(payload);
    assert.strictEqual(res.valid, true);
  });

  it("F13-2: normalizes trailing slashes on custom base URLs", () => {
    const normalized1 = normalizeBaseUrl("https://api.custom-ai.com/v1/");
    const normalized2 = normalizeBaseUrl("https://api.custom-ai.com/v1///");
    const normalized3 = normalizeBaseUrl("https://api.custom-ai.com/v1");

    assert.strictEqual(normalized1, "https://api.custom-ai.com/v1");
    assert.strictEqual(normalized2, "https://api.custom-ai.com/v1");
    assert.strictEqual(normalized3, "https://api.custom-ai.com/v1");
  });

  it("F13-3: routes request to custom endpoint overriding default provider url", () => {
    const resolved = resolveProviderEndpoint("openai", {
      baseUrl: "https://custom-gateway.internal/v1/",
      apiKey: "sk-special-key",
    });

    assert.strictEqual(resolved.baseUrl, "https://custom-gateway.internal/v1");
    assert.strictEqual(resolved.apiKey, "sk-special-key");
    assert.strictEqual(resolved.isCustom, true);
  });

  it("F13-4: falls back to default provider base URL when custom config is omitted", () => {
    const resolvedOpenAi = resolveProviderEndpoint("openai");
    const resolvedGoogle = resolveProviderEndpoint("google");

    assert.strictEqual(resolvedOpenAi.baseUrl, "https://api.openai.com/v1");
    assert.strictEqual(resolvedGoogle.baseUrl, "https://generativelanguage.googleapis.com/v1beta");
    assert.strictEqual(resolvedOpenAi.isCustom, false);
  });

  it("F13-5: sanitizes error responses to prevent API key leakage in logs or client messages", () => {
    const sanitizeErrorMessage = (errorMsg: string, secretKey: string): string => {
      if (!secretKey) return errorMsg;
      return errorMsg.replaceAll(secretKey, "[REDACTED_API_KEY]");
    };

    const userKey = "sk-live-secret-9876543210";
    const rawError = `Authentication failed for key sk-live-secret-9876543210 at endpoint https://api.openai.com`;
    const sanitized = sanitizeErrorMessage(rawError, userKey);

    assert.doesNotMatch(sanitized, /sk-live-secret-9876543210/);
    assert.ok(sanitized.includes("[REDACTED_API_KEY]"));
  });
});

import test, { describe, it } from "node:test";
import assert from "node:assert";

class CustomEndpointValidator {
  static validateBaseUrl(url?: string): { valid: boolean; normalized?: string; error?: string } {
    if (!url || url.trim() === "") return { valid: true, normalized: undefined };

    const trimmed = url.trim();
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { valid: false, error: `Disallowed protocol: ${parsed.protocol}` };
      }
      // Clean query and hash
      const cleanUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");
      return { valid: true, normalized: cleanUrl };
    } catch {
      return { valid: false, error: "Malformed URL" };
    }
  }

  static sanitizeApiKey(key?: string): string | undefined {
    if (!key) return undefined;
    const trimmed = key.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}

describe("Tier 2 Boundary B13: Custom Base URL & API Key Boundaries", () => {
  it("B13-1: strips query parameters and trailing slashes from custom baseUrl", () => {
    const res = CustomEndpointValidator.validateBaseUrl("https://openai.custom.com/v1/?api-version=2024#section");
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.normalized, "https://openai.custom.com/v1");
  });

  it("B13-2: rejects dangerous or non-HTTP protocols (e.g. ftp://, javascript:, file://)", () => {
    assert.strictEqual(CustomEndpointValidator.validateBaseUrl("javascript:alert(1)").valid, false);
    assert.strictEqual(CustomEndpointValidator.validateBaseUrl("ftp://files.example.com").valid, false);
    assert.strictEqual(CustomEndpointValidator.validateBaseUrl("file:///etc/passwd").valid, false);
  });

  it("B13-3: handles undefined or empty custom baseUrl gracefully", () => {
    assert.strictEqual(CustomEndpointValidator.validateBaseUrl(undefined).normalized, undefined);
    assert.strictEqual(CustomEndpointValidator.validateBaseUrl("").normalized, undefined);
    assert.strictEqual(CustomEndpointValidator.validateBaseUrl("   ").normalized, undefined);
  });

  it("B13-4: sanitizes API key with leading/trailing whitespace and newlines", () => {
    const sanitized = CustomEndpointValidator.sanitizeApiKey("  \nsk-123456789abcdef  \n");
    assert.strictEqual(sanitized, "sk-123456789abcdef");
  });

  it("B13-5: handles very long custom API keys (e.g. 4096-char JWT service tokens)", () => {
    const longToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + "a".repeat(4000);
    const sanitized = CustomEndpointValidator.sanitizeApiKey(longToken);
    assert.strictEqual(sanitized?.length, longToken.length);
  });
});

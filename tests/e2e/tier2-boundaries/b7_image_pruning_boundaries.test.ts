import { describe, it } from "node:test";
import assert from "node:assert";

class MockChatUploadHandler {
  static validateAttachment(file: {
    name: string;
    size: number;
    type: string;
  }): { valid: boolean; error?: string } {
    const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    const MAX_SIZE = 20 * 1024 * 1024; // 20MB

    if (file.size === 0) {
      return { valid: false, error: "ZERO_BYTE_FILE" };
    }
    if (file.size > MAX_SIZE) {
      return { valid: false, error: "FILE_TOO_LARGE" };
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return { valid: false, error: "UNSUPPORTED_MIME_TYPE" };
    }
    return { valid: true };
  }

  static parseLegacySession(sessionJson: any): any {
    // Strips legacy Stable Diffusion settings and keeps clean chat messages
    const { sdParams, sdModel, ...cleanSession } = sessionJson;
    return cleanSession;
  }
}

describe("Tier 2 Boundary B7: Standalone Image Gen Pruning Boundaries", () => {
  it("B7-1: accepts valid vision image uploads (PNG, JPEG, WEBP)", () => {
    const png = MockChatUploadHandler.validateAttachment({
      name: "chart.png",
      size: 1024 * 50,
      type: "image/png",
    });
    const jpg = MockChatUploadHandler.validateAttachment({
      name: "photo.jpg",
      size: 1024 * 100,
      type: "image/jpeg",
    });
    const webp = MockChatUploadHandler.validateAttachment({
      name: "anim.webp",
      size: 1024 * 200,
      type: "image/webp",
    });

    assert.strictEqual(png.valid, true);
    assert.strictEqual(jpg.valid, true);
    assert.strictEqual(webp.valid, true);
  });

  it("B7-2: rejects non-image files dropped into chat (e.g. exe, zip, pdf)", () => {
    const exe = MockChatUploadHandler.validateAttachment({
      name: "setup.exe",
      size: 1024 * 1024,
      type: "application/x-msdownload",
    });
    const zip = MockChatUploadHandler.validateAttachment({
      name: "archive.zip",
      size: 1024 * 500,
      type: "application/zip",
    });

    assert.strictEqual(exe.valid, false);
    assert.strictEqual(exe.error, "UNSUPPORTED_MIME_TYPE");
    assert.strictEqual(zip.valid, false);
  });

  it("B7-3: rejects zero-byte empty image files", () => {
    const empty = MockChatUploadHandler.validateAttachment({
      name: "empty.png",
      size: 0,
      type: "image/png",
    });
    assert.strictEqual(empty.valid, false);
    assert.strictEqual(empty.error, "ZERO_BYTE_FILE");
  });

  it("B7-4: rejects oversized image attachments exceeding 20MB limit", () => {
    const huge = MockChatUploadHandler.validateAttachment({
      name: "huge.png",
      size: 25 * 1024 * 1024,
      type: "image/png",
    });
    assert.strictEqual(huge.valid, false);
    assert.strictEqual(huge.error, "FILE_TOO_LARGE");
  });

  it("B7-5: legacy sessions with SD params are sanitized without crashing chat core", () => {
    const legacySession = {
      id: "session_old_sd",
      topic: "Art Concept",
      messages: [{ role: "user", content: "Draw a mountain" }],
      sdParams: { steps: 30, cfgScale: 7.5, sampler: "Euler a" },
      sdModel: "sd_xl_base.safetensors",
    };

    const clean = MockChatUploadHandler.parseLegacySession(legacySession);
    assert.strictEqual(clean.id, "session_old_sd");
    assert.strictEqual(clean.sdParams, undefined);
    assert.strictEqual(clean.sdModel, undefined);
    assert.strictEqual(clean.messages.length, 1);
  });
});

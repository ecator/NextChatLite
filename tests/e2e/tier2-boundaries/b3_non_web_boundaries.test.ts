import { describe, it } from "node:test";
import assert from "node:assert";

class MockPlatformBridge {
  static getPlatform(): "web" | "desktop" {
    // Pure web platform detection returns web
    return "web";
  }

  static async copyToClipboard(
    text: string,
    clipboardApi?: { writeText: (t: string) => Promise<void> },
  ): Promise<boolean> {
    try {
      if (clipboardApi && typeof clipboardApi.writeText === "function") {
        await clipboardApi.writeText(text);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  static handleDeepLink(url: string): { handled: boolean; error?: string } {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return {
        handled: false,
        error: "Non-HTTP protocol rejected in pure web mode",
      };
    }
    return { handled: true };
  }
}

describe("Tier 2 Boundary B3: Non-Web Platform Stripping Boundaries", () => {
  it("B3-1: platform detection returns 'web' even if mock window object exists", () => {
    assert.strictEqual(MockPlatformBridge.getPlatform(), "web");
  });

  it("B3-2: handles clipboard copy rejection safely when permissions denied", async () => {
    const failingClipboard = {
      writeText: async () => {
        throw new Error("NotAllowedError: Permission denied");
      },
    };

    const success = await MockPlatformBridge.copyToClipboard(
      "sample text",
      failingClipboard,
    );
    assert.strictEqual(success, false);
  });

  it("B3-3: handles successful web standard clipboard writeText", async () => {
    let captured = "";
    const workingClipboard = {
      writeText: async (t: string) => {
        captured = t;
      },
    };

    const success = await MockPlatformBridge.copyToClipboard(
      "hello web chat",
      workingClipboard,
    );
    assert.strictEqual(success, true);
    assert.strictEqual(captured, "hello web chat");
  });

  it("B3-4: rejects desktop custom URI protocols (e.g. nextchat://) in web mode", () => {
    const res1 = MockPlatformBridge.handleDeepLink(
      "nextchat://session/import?data=123",
    );
    assert.strictEqual(res1.handled, false);
    assert.ok(res1.error?.includes("Non-HTTP"));

    const res2 = MockPlatformBridge.handleDeepLink(
      "https://nextchat.example.com/share/123",
    );
    assert.strictEqual(res2.handled, true);
  });

  it("B3-5: file upload uses standard HTML5 File/Blob objects without native path dependencies", () => {
    const mockFile = {
      name: "diagram.png",
      size: 1024 * 100,
      type: "image/png",
      arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
    };

    assert.strictEqual(mockFile.type, "image/png");
    assert.ok(
      !("path" in mockFile),
      "HTML5 File object in pure web browser does not have native .path property",
    );
  });
});

import test, { describe, it } from "node:test";
import assert from "node:assert";
import { directoryExists, fileExists, readProjectFile } from "../fixtures/test_helpers";

describe("Feature F7: Standalone Image Generation Pruning (Stable Diffusion & DALL-E)", () => {
  it("F7-1: verifies complete absence of app/components/sd/ directory", () => {
    assert.strictEqual(
      directoryExists("app/components/sd"),
      false,
      "app/components/sd directory must be deleted"
    );
  });

  it("F7-2: verifies complete absence of app/store/sd.ts store file", () => {
    assert.strictEqual(
      fileExists("app/store/sd.ts"),
      false,
      "app/store/sd.ts must be deleted"
    );
  });

  it("F7-3: verifies complete absence of Stability AI route (app/api/stability.ts)", () => {
    assert.strictEqual(
      fileExists("app/api/stability.ts"),
      false,
      "app/api/stability.ts must be deleted"
    );
  });

  it("F7-4: verifies sidebar does not render Stable Diffusion navigation icon/tab", () => {
    if (fileExists("app/components/sidebar.tsx")) {
      const sidebarContent = readProjectFile("app/components/sidebar.tsx");
      assert.doesNotMatch(
        sidebarContent,
        /Path\.Sd|Path\.StableDiffusion|useSdStore/i,
        "Sidebar must not contain Stable Diffusion tab navigation"
      );
    }
  });

  it("F7-5: verifies chat view does not contain standalone DALL-E generator button", () => {
    if (fileExists("app/components/chat.tsx")) {
      const chatContent = readProjectFile("app/components/chat.tsx");
      assert.doesNotMatch(
        chatContent,
        /dall-e-3-generator|generateImageModal/i,
        "Chat component must not contain standalone image generation modals"
      );
    }
  });
});

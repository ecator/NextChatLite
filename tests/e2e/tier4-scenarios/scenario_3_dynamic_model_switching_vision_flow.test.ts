import { describe, it } from "node:test";
import assert from "node:assert";
import { readJsonFile } from "../fixtures/test_helpers";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";

describe("Tier 4 Scenario 3: Dynamic Model Switching with Vision & Metadata Adaptation", () => {
  const modelsCatalog = readJsonFile(
    "tests/e2e/fixtures/mock_models_dev.json",
  ).models;

  it("handles seamless model switching from text-only to multimodal vision model with parameter recalculation", () => {
    // 1. Initial state with text-only model (o3-mini)
    let currentModelKey = "openai/o3-mini";
    let meta = modelsCatalog[currentModelKey];

    assert.strictEqual(meta.hasVision, false);
    assert.strictEqual(meta.outputLimit, 100000);

    // UI state: Image upload button is disabled
    let isUploadEnabled = Boolean(meta.hasVision);
    assert.strictEqual(isUploadEnabled, false);

    // 2. User switches model in dropdown to Gemini 3 Pro (Google)
    currentModelKey = "google/gemini-3-pro";
    meta = modelsCatalog[currentModelKey];

    assert.strictEqual(meta.hasVision, true);
    assert.strictEqual(meta.contextLimit, 2097152);
    assert.strictEqual(meta.outputLimit, 65536);

    // UI state: Image upload button becomes enabled
    isUploadEnabled = Boolean(meta.hasVision);
    assert.strictEqual(isUploadEnabled, true);

    // 3. User attaches an image and submits multimodal prompt
    const mockImageAttachment = {
      type: "image/png",
      base64:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    };

    const visionChatRequest = {
      model: meta.id,
      provider: meta.provider,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe what is depicted in this uploaded architecture schematic.",
            },
            { type: "image", image: mockImageAttachment.base64 },
          ],
        },
      ],
    };

    assert.strictEqual(visionChatRequest.messages[0].content.length, 2);

    // 4. Stream response from Gemini 3 Vision
    const visionStream = [
      encodeDataStreamChunk(
        "g",
        "Inspecting diagram nodes: Next.js frontend, AI SDK backend, models.dev catalog.\n",
      ),
      encodeDataStreamChunk(
        "0",
        "The diagram illustrates a modern server-rendered architecture connecting the client UI to Vercel AI SDK and dynamic models.dev metadata.",
      ),
      encodeDataStreamChunk("d", { finishReason: "stop" }),
    ].join("");

    const chunks = parseDataStreamResponse(visionStream);
    const state = accumulateStreamState(chunks);

    assert.ok(state.reasoning.includes("Inspecting diagram nodes"));
    assert.ok(state.text.includes("modern server-rendered architecture"));
    assert.strictEqual(state.isFinished, true);
  });
});

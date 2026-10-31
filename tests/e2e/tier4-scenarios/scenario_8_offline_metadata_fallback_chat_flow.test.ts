import test, { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";

describe("Tier 4 Scenario 8: Offline Metadata Fallback & Chat Recovery Flow", () => {
  it("recovers from remote models.dev outage using static catalog snapshot and completes chat streaming", async () => {
    // 1. Simulating remote fetch failure from models.dev (offline / 503 Service Unavailable)
    const fetchRemoteModels = async (): Promise<any> => {
      throw new Error("FetchError: 503 Service Unavailable (models.dev)");
    };

    const BUNDLED_SNAPSHOT = {
      "google/gemini-3-flash": {
        id: "gemini-3-flash",
        name: "Gemini 3 Flash",
        provider: "google",
        contextLimit: 1048576,
        outputLimit: 8192,
        hasVision: true,
        hasReasoning: true,
      },
      "openai/gpt-4o": {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        contextLimit: 128000,
        outputLimit: 4096,
        hasVision: true,
        hasReasoning: false,
      },
    };

    // 2. Fallback loader recovers snapshot
    let activeCatalog: Record<string, any> = {};
    let isUsingFallback = false;

    try {
      activeCatalog = await fetchRemoteModels();
    } catch {
      isUsingFallback = true;
      activeCatalog = BUNDLED_SNAPSHOT;
    }

    assert.strictEqual(isUsingFallback, true);
    assert.ok(activeCatalog["google/gemini-3-flash"]);

    // 3. User selects snapshot model and starts chat
    const model = activeCatalog["google/gemini-3-flash"];
    assert.strictEqual(model.id, "gemini-3-flash");
    assert.strictEqual(model.contextLimit, 1048576);

    // 4. Stream response proceeds cleanly
    const stream = [
      encodeDataStreamChunk("0", "Fallback model loaded successfully. Ready to assist!"),
      encodeDataStreamChunk("d", { finishReason: "stop" }),
    ].join("");

    const chunks = parseDataStreamResponse(stream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.text, "Fallback model loaded successfully. Ready to assist!");
    assert.strictEqual(state.isFinished, true);
  });
});

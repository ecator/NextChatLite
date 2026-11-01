import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";

describe("Tier 4 Scenario 2: Custom Base URL & OpenAPI Tool Calling Flow", () => {
  it("routes tool-calling chat requests through custom gateway with user API key", () => {
    // 1. User configures custom endpoint & secret key in access store
    const userAccessConfig = {
      baseUrl: "https://ai-gateway.internal.corp/v1",
      apiKey: "sk-corp-dev-token-998877",
    };

    // 2. Client initiates chat request with OpenAPI weather tool active
    const requestPayload = {
      model: "gpt-4o",
      provider: "openai",
      customConfig: userAccessConfig,
      messages: [
        {
          role: "user",
          content: "What is the temperature in San Francisco right now?",
        },
      ],
      pluginIds: ["weather_service"],
    };

    assert.strictEqual(
      requestPayload.customConfig.baseUrl,
      "https://ai-gateway.internal.corp/v1",
    );

    // 3. Server initiates stream to custom gateway and executes tool
    const customGatewayStream = [
      encodeDataStreamChunk("9", {
        toolCallId: "call_sf_weather",
        toolName: "getCurrentWeather",
        args: { location: "San Francisco", unit: "celsius" },
      }),
      encodeDataStreamChunk("a", {
        toolCallId: "call_sf_weather",
        result: {
          city: "San Francisco",
          temperature: 16.5,
          condition: "Partly Cloudy",
          humidity: 72,
        },
      }),
      encodeDataStreamChunk(
        "0",
        "The current temperature in San Francisco is **16.5°C** with partly cloudy skies and 72% humidity.",
      ),
      encodeDataStreamChunk("d", {
        finishReason: "stop",
        usage: { promptTokens: 45, completionTokens: 68 },
      }),
    ].join("");

    const chunks = parseDataStreamResponse(customGatewayStream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.toolCalls.length, 1);
    assert.strictEqual(state.toolCalls[0].args.location, "San Francisco");
    assert.strictEqual(state.toolResults[0].result.temperature, 16.5);
    assert.ok(state.text.includes("16.5°C"));
    assert.strictEqual(state.isFinished, true);

    // 4. Verify no sensitive key is leaked into conversation response
    assert.doesNotMatch(state.text, /sk-corp-dev-token-998877/);
  });
});

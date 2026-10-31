import test, { describe, it } from "node:test";
import assert from "node:assert";
import { readJsonFile } from "../fixtures/test_helpers";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  encodeDataStreamChunk,
} from "../fixtures/mock_chat_streams";

interface OpenApiToolDefinition {
  name: string;
  description: string;
  parameters: any;
}

function convertOpenApiSpecToAiTools(spec: any): Record<string, OpenApiToolDefinition> {
  const tools: Record<string, OpenApiToolDefinition> = {};
  const paths = spec.paths || {};

  for (const [pathKey, methods] of Object.entries<any>(paths)) {
    for (const [method, op] of Object.entries<any>(methods)) {
      if (typeof op !== "object" || !op.operationId) continue;

      const properties: Record<string, any> = {};
      const required: string[] = [];

      if (Array.isArray(op.parameters)) {
        for (const param of op.parameters) {
          properties[param.name] = {
            type: param.schema?.type || "string",
            description: param.description || "",
          };
          if (param.required) {
            required.push(param.name);
          }
        }
      }

      tools[op.operationId] = {
        name: op.operationId,
        description: op.summary || op.description || `${method.toUpperCase()} ${pathKey}`,
        parameters: {
          type: "object",
          properties,
          required,
        },
      };
    }
  }

  return tools;
}

describe("Feature F14: OpenAPI Plugin Tool Calling in Vercel AI SDK", () => {
  const weatherSpec = readJsonFile("tests/e2e/fixtures/mock_openapi_spec.json");

  it("F14-1: converts OpenAPI 3.x specification into AI SDK tool definition", () => {
    const tools = convertOpenApiSpecToAiTools(weatherSpec);
    assert.ok(tools.getCurrentWeather, "Tool getCurrentWeather must be generated");
    assert.strictEqual(tools.getCurrentWeather.name, "getCurrentWeather");
    assert.strictEqual(tools.getCurrentWeather.parameters.properties.location.type, "string");
    assert.deepStrictEqual(tools.getCurrentWeather.parameters.required, ["location"]);
  });

  it("F14-2: parses tool_call stream chunks (prefix 9) from AI SDK", () => {
    const toolCallPayload = {
      toolCallId: "call_abc123",
      toolName: "getCurrentWeather",
      args: { location: "Tokyo", unit: "celsius" },
    };
    const stream = `${encodeDataStreamChunk("9", toolCallPayload)}${encodeDataStreamChunk("d", { finishReason: "tool-calls" })}`;
    const chunks = parseDataStreamResponse(stream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.toolCalls.length, 1);
    assert.strictEqual(state.toolCalls[0].toolName, "getCurrentWeather");
    assert.strictEqual(state.toolCalls[0].args.location, "Tokyo");
  });

  it("F14-3: parses tool_result stream chunks (prefix a) from client/server execution", () => {
    const toolResultPayload = {
      toolCallId: "call_abc123",
      result: { city: "Tokyo", temperature: 22, condition: "Sunny" },
    };
    const stream = `${encodeDataStreamChunk("a", toolResultPayload)}`;
    const chunks = parseDataStreamResponse(stream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.toolResults.length, 1);
    assert.strictEqual(state.toolResults[0].result.city, "Tokyo");
    assert.strictEqual(state.toolResults[0].result.temperature, 22);
  });

  it("F14-4: supports multi-step execution (tool calling followed by synthesis text)", () => {
    const multiStepStream = [
      encodeDataStreamChunk("9", { toolCallId: "call_1", toolName: "getCurrentWeather", args: { location: "Paris" } }),
      encodeDataStreamChunk("a", { toolCallId: "call_1", result: { city: "Paris", temperature: 18, condition: "Cloudy" } }),
      encodeDataStreamChunk("0", "The current weather in Paris is 18°C and cloudy."),
      encodeDataStreamChunk("d", { finishReason: "stop" }),
    ].join("");

    const chunks = parseDataStreamResponse(multiStepStream);
    const state = accumulateStreamState(chunks);

    assert.strictEqual(state.toolCalls.length, 1);
    assert.strictEqual(state.toolResults.length, 1);
    assert.strictEqual(state.text, "The current weather in Paris is 18°C and cloudy.");
    assert.strictEqual(state.isFinished, true);
  });

  it("F14-5: validates CORS proxy URL formatting for external API plugin requests", () => {
    const makeProxyUrl = (targetUrl: string, proxyEndpoint = "/api/proxy"): string => {
      const url = new URL(proxyEndpoint, "http://localhost:3000");
      url.searchParams.set("url", targetUrl);
      return url.pathname + url.search;
    };

    const proxyPath = makeProxyUrl("https://api.weather-example.com/v1/weather/current?location=London");
    assert.ok(proxyPath.startsWith("/api/proxy?url="));
    assert.ok(proxyPath.includes(encodeURIComponent("https://api.weather-example.com/v1/weather/current?location=London")));
  });
});

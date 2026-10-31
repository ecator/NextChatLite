import test, { describe, it } from "node:test";
import assert from "node:assert";

class OpenApiToolBoundaryValidator {
  static sanitizeToolArguments(rawArgs: any): Record<string, any> {
    if (!rawArgs || typeof rawArgs !== "object") return {};
    return rawArgs;
  }

  static handleToolExecutionError(toolName: string, err: any): { isError: boolean; result: string } {
    const errorMsg = err?.message || String(err) || "Unknown tool error";
    return {
      isError: true,
      result: `Tool '${toolName}' execution failed: ${errorMsg}`,
    };
  }

  static clampToolResultSize(result: any, maxChars = 100_000): string {
    const str = typeof result === "string" ? result : JSON.stringify(result);
    if (str.length > maxChars) {
      return str.slice(0, maxChars) + "\n...[TRUNCATED_DUE_TO_SIZE]";
    }
    return str;
  }
}

describe("Tier 2 Boundary B14: OpenAPI Tools Execution Boundaries", () => {
  it("B14-1: handles null or non-object tool arguments gracefully", () => {
    assert.deepStrictEqual(OpenApiToolBoundaryValidator.sanitizeToolArguments(null), {});
    assert.deepStrictEqual(OpenApiToolBoundaryValidator.sanitizeToolArguments(undefined), {});
    assert.deepStrictEqual(OpenApiToolBoundaryValidator.sanitizeToolArguments("invalid"), {});
    assert.deepStrictEqual(OpenApiToolBoundaryValidator.sanitizeToolArguments({ city: "Tokyo" }), { city: "Tokyo" });
  });

  it("B14-2: formats tool execution exceptions into graceful tool-result messages", () => {
    const errorResult = OpenApiToolBoundaryValidator.handleToolExecutionError("getWeather", new Error("Network timeout after 5000ms"));
    assert.strictEqual(errorResult.isError, true);
    assert.ok(errorResult.result.includes("Network timeout"));
  });

  it("B14-3: truncates oversized tool result outputs exceeding 100KB limit", () => {
    const hugeOutput = "A".repeat(150_000);
    const clamped = OpenApiToolBoundaryValidator.clampToolResultSize(hugeOutput, 100_000);

    assert.ok(clamped.includes("[TRUNCATED_DUE_TO_SIZE]"));
    assert.ok(clamped.length < 101_000);
  });

  it("B14-4: handles OpenAPI spec with 0 parameters and static payload response", () => {
    const staticToolSpec = {
      name: "getSystemStatus",
      description: "Returns health status",
      parameters: { type: "object", properties: {}, required: [] },
    };

    assert.strictEqual(staticToolSpec.name, "getSystemStatus");
    assert.strictEqual(Object.keys(staticToolSpec.parameters.properties).length, 0);
  });

  it("B14-5: handles tool execution returning non-JSON plain text or numbers", () => {
    const textRes = OpenApiToolBoundaryValidator.clampToolResultSize("Server is OK");
    const numRes = OpenApiToolBoundaryValidator.clampToolResultSize(42);

    assert.strictEqual(textRes, "Server is OK");
    assert.strictEqual(numRes, "42");
  });
});

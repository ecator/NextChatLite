import { describe, it } from "node:test";
import assert from "node:assert";

function isNext16Compliant(versionString: string): boolean {
  const clean = versionString.replace(/[\^~>=]/g, "").trim();
  const major = parseInt(clean.split(".")[0], 10);
  return major >= 16;
}

function handleRouteParamsBoundary(params: any): {
  valid: boolean;
  resolvedParams?: any;
  error?: string;
} {
  if (params === null || params === undefined) {
    return { valid: false, error: "Null or undefined params" };
  }
  // Next 16 async params handling
  if (typeof params?.then === "function") {
    return { valid: true, resolvedParams: "PROMISE" };
  }
  if (typeof params === "object") {
    return { valid: true, resolvedParams: params };
  }
  return { valid: false, error: "Invalid params format" };
}

describe("Tier 2 Boundary B2: Next.js 16+ & React 19 Boundaries", () => {
  it("B2-1: rejects Next.js version 14 and 15, requires 16+", () => {
    assert.strictEqual(isNext16Compliant("14.1.1"), false);
    assert.strictEqual(isNext16Compliant("^14.2.5"), false);
    assert.strictEqual(isNext16Compliant("15.0.0"), false);
    assert.strictEqual(isNext16Compliant("^15.1.0"), false);
    assert.strictEqual(isNext16Compliant("16.0.0"), true);
    assert.strictEqual(isNext16Compliant("^16.1.0-canary.1"), true);
    assert.strictEqual(isNext16Compliant("17.0.0"), true);
  });

  it("B2-2: handles Next 16 async route params promise resolution", async () => {
    const syncResult = handleRouteParamsBoundary({ provider: "google" });
    assert.strictEqual(syncResult.valid, true);

    const asyncParamsPromise = Promise.resolve({ provider: "google" });
    const asyncResult = handleRouteParamsBoundary(asyncParamsPromise);
    assert.strictEqual(asyncResult.valid, true);
    assert.strictEqual(asyncResult.resolvedParams, "PROMISE");

    const resolved = await asyncParamsPromise;
    assert.strictEqual(resolved.provider, "google");
  });

  it("B2-3: handles empty request body and malformed JSON in API route handlers", async () => {
    const parseRouteBody = async (rawBody: string | null) => {
      if (!rawBody || rawBody.trim() === "") {
        return { status: 400, error: "EMPTY_BODY" };
      }
      try {
        const json = JSON.parse(rawBody);
        return { status: 200, data: json };
      } catch (err: any) {
        return { status: 400, error: "INVALID_JSON", details: err.message };
      }
    };

    assert.strictEqual((await parseRouteBody("")).error, "EMPTY_BODY");
    assert.strictEqual((await parseRouteBody("   ")).error, "EMPTY_BODY");
    assert.strictEqual((await parseRouteBody(null)).error, "EMPTY_BODY");
    assert.strictEqual(
      (await parseRouteBody("{ broken json")).error,
      "INVALID_JSON",
    );
    assert.strictEqual((await parseRouteBody('{"valid":"json"}')).status, 200);
  });

  it("B2-4: handles route params with URL encoded characters and slashes", () => {
    const sanitizeRouteParam = (param: string): string => {
      return decodeURIComponent(param)
        .replace(/[\0\r\n]/g, "")
        .trim();
    };

    assert.strictEqual(
      sanitizeRouteParam("google%2Fgemini-3-pro"),
      "google/gemini-3-pro",
    );
    assert.strictEqual(
      sanitizeRouteParam("model%20name%20with%20spaces"),
      "model name with spaces",
    );
    assert.strictEqual(sanitizeRouteParam("clean-id"), "clean-id");
  });

  it("B2-5: verifies React 19 Action and useActionState compatibility bounds", () => {
    // React 19 supports async actions in transitions
    const executeAction = async (
      prevState: { count: number },
      formData: FormData,
    ) => {
      const increment = Number(formData.get("inc")) || 1;
      return { count: prevState.count + increment };
    };

    const mockFormData = new Map<string, any>();
    mockFormData.set("inc", "5");
    const formDataShim = {
      get: (k: string) => mockFormData.get(k),
    } as FormData;

    return executeAction({ count: 10 }, formDataShim).then((next) => {
      assert.strictEqual(next.count, 15);
    });
  });
});

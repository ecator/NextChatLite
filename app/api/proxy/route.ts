import { NextRequest, NextResponse } from "next/server";

async function handle(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  // 1. Check target URL from query parameter or headers
  const urlParam = req.nextUrl.searchParams.get("url");
  const xBaseUrl = req.headers.get("x-base-url");

  let targetUrl: string | null = null;

  if (urlParam) {
    targetUrl = urlParam;
  } else if (xBaseUrl) {
    const cloneSearchParams = new URLSearchParams(req.nextUrl.searchParams);
    cloneSearchParams.delete("path");
    cloneSearchParams.delete("provider");
    const queryStr = cloneSearchParams.toString();
    targetUrl = `${xBaseUrl.replace(/\/+$/, "")}${queryStr ? `?${queryStr}` : ""}`;
  }

  if (!targetUrl) {
    return NextResponse.json(
      {
        error: true,
        message:
          "Missing target URL in 'url' query param or 'X-Base-URL' header",
      },
      { status: 400 },
    );
  }

  const skipHeaders = [
    "connection",
    "host",
    "origin",
    "referer",
    "cookie",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
  ];

  const headers = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower.startsWith("x-") ||
      lower.startsWith("sec-") ||
      skipHeaders.includes(lower)
    ) {
      continue;
    }
    headers.set(key, value);
  }

  const controller = new AbortController();
  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    redirect: "follow",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  const timeoutId = setTimeout(() => controller.abort(), 60 * 1000);

  try {
    const res = await fetch(targetUrl, fetchOptions);
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");
    newHeaders.set("X-Accel-Buffering", "no");
    newHeaders.delete("content-encoding");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: true,
        message: `Proxy fetch failed: ${err.message || String(err)}`,
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;

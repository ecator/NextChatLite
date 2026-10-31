// Learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import { jest } from "@jest/globals";

if (typeof (global as any).TextDecoder === "undefined") {
  const { TextDecoder, TextEncoder } = require("node:util");
  (global as any).TextDecoder = TextDecoder;
  (global as any).TextEncoder = TextEncoder;
}

if (typeof (global as any).TransformStream === "undefined") {
  const {
    TransformStream,
    ReadableStream,
    WritableStream,
  } = require("node:stream/web");
  (global as any).TransformStream = TransformStream;
  (global as any).ReadableStream = ReadableStream;
  (global as any).WritableStream = WritableStream;
}

if (typeof (global as any).Request === "undefined") {
  (global as any).Request = class Request {
    url: string;
    constructor(input: any) {
      this.url = typeof input === "string" ? input : input?.url || "";
    }
  };
  (global as any).Response = class Response {};
  (global as any).Headers = class Headers {};
}

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
    headers: new Headers(),
    redirected: false,
    statusText: "OK",
    type: "basic",
    url: "",
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(""),
  } as Response),
);

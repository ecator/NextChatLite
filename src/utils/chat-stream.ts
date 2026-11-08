/**
 * Client stream processing utility for Vercel AI SDK streams.
 * Handles dual stream protocols:
 * 1. AI SDK Data Stream protocol (<prefix>:<data> with prefixes 0:, g:, 9:, a:, e:, 3:, d:)
 * 2. Server-Sent Events UI message stream (data: {"type": ...} and data: [DONE])
 */

export interface StreamToolCall {
  toolCallId: string;
  toolName: string;
  args: any;
  [key: string]: any;
}

export interface StreamToolResult {
  toolCallId: string;
  result: any;
  [key: string]: any;
}

export interface ProcessDataStreamOptions {
  stream: ReadableStream<Uint8Array | string> | Response | null | undefined;
  onTextPart?: (delta: string) => void | Promise<void>;
  onReasoningPart?: (delta: string) => void | Promise<void>;
  onToolCallPart?: (toolCall: StreamToolCall) => void | Promise<void>;
  onToolResultPart?: (toolResult: StreamToolResult) => void | Promise<void>;
  onErrorPart?: (error: string) => void | Promise<void>;
  onFinishMessagePart?: (finish?: any) => void | Promise<void>;
  abortSignal?: AbortSignal;
}

export async function processDataStream(
  options: ProcessDataStreamOptions,
): Promise<void> {
  const {
    stream: rawStream,
    onTextPart,
    onReasoningPart,
    onToolCallPart,
    onToolResultPart,
    onErrorPart,
    onFinishMessagePart,
    abortSignal,
  } = options;

  if (!rawStream) {
    onFinishMessagePart?.();
    return;
  }

  let stream: ReadableStream<Uint8Array | string>;
  if (typeof (rawStream as any)?.getReader === "function") {
    stream = rawStream as ReadableStream<Uint8Array | string>;
  } else if ((rawStream as any)?.body) {
    stream = (rawStream as any).body;
  } else {
    onFinishMessagePart?.();
    return;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const triggerFinish = (finishData?: any) => {
    if (!finished) {
      finished = true;
      onFinishMessagePart?.(finishData);
    }
  };

  const processLine = (rawLine: string) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    // 1. Server-Sent Events UI Message Stream format (data: ...)
    if (trimmed.startsWith("data:")) {
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr) return;
      if (dataStr === "[DONE]") {
        triggerFinish();
        return;
      }

      try {
        const json = JSON.parse(dataStr);
        const type = json.type;

        switch (type) {
          case "text-delta": {
            const reasoningDelta =
              json.reasoning_content ?? json.reasoning ?? json.thought;
            if (
              typeof reasoningDelta === "string" &&
              reasoningDelta.length > 0
            ) {
              onReasoningPart?.(reasoningDelta);
            }
            const delta = json.delta ?? json.textDelta ?? json.text;
            if (typeof delta === "string") {
              onTextPart?.(delta);
            }
            break;
          }
          case "reasoning-delta":
          case "reasoning":
          case "thought":
          case "reasoning_content": {
            const delta =
              json.delta ??
              json.textDelta ??
              json.reasoning ??
              json.reasoning_content ??
              json.text ??
              json.thought;
            if (typeof delta === "string") {
              onReasoningPart?.(delta);
            }
            break;
          }
          case "tool-input-available":
          case "tool-call": {
            const toolCallId = json.toolCallId || json.id || "";
            const toolName = json.toolName || json.name || "";
            const args = json.args ?? json.input ?? {};
            onToolCallPart?.({ ...json, toolCallId, toolName, args });
            break;
          }
          case "tool-output-available":
          case "tool-result": {
            const toolCallId = json.toolCallId || json.id || "";
            const result = json.result ?? json.output;
            onToolResultPart?.({ ...json, toolCallId, result });
            break;
          }
          case "tool-output-error": {
            const err =
              typeof json.errorText === "string"
                ? json.errorText
                : typeof json.error === "string"
                  ? json.error
                  : JSON.stringify(json.errorText || json.error || json);
            onErrorPart?.(err);
            break;
          }
          case "error": {
            const err =
              typeof json.errorText === "string"
                ? json.errorText
                : typeof json.message === "string"
                  ? json.message
                  : typeof json.error === "string"
                    ? json.error
                    : JSON.stringify(json);
            onErrorPart?.(err);
            break;
          }
          case "finish": {
            triggerFinish(json);
            break;
          }
        }
      } catch {
        // Ignore unparseable SSE line
      }
      return;
    }

    // 2. AI SDK Data Stream protocol (<prefix>:<data>)
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) return;

    const prefix = trimmed.slice(0, colonIdx);
    const rawData = trimmed.slice(colonIdx + 1);

    let parsedData: any;
    try {
      parsedData = JSON.parse(rawData);
    } catch {
      parsedData = rawData;
    }

    switch (prefix) {
      case "0": {
        const delta =
          typeof parsedData === "string"
            ? parsedData
            : String(parsedData ?? "");
        onTextPart?.(delta);
        break;
      }
      case "g": {
        const delta =
          typeof parsedData === "string"
            ? parsedData
            : (parsedData?.reasoning ??
              parsedData?.delta ??
              JSON.stringify(parsedData));
        onReasoningPart?.(delta);
        break;
      }
      case "9":
      case "b": {
        const toolCallId = parsedData?.toolCallId || parsedData?.id || "";
        const toolName = parsedData?.toolName || parsedData?.name || "";
        const args = parsedData?.args ?? parsedData?.input ?? {};
        onToolCallPart?.({
          ...(typeof parsedData === "object" && parsedData !== null
            ? parsedData
            : {}),
          toolCallId,
          toolName,
          args,
        });
        break;
      }
      case "a":
      case "c": {
        const toolCallId = parsedData?.toolCallId || parsedData?.id || "";
        const result = parsedData?.result ?? parsedData?.output;
        onToolResultPart?.({
          ...(typeof parsedData === "object" && parsedData !== null
            ? parsedData
            : {}),
          toolCallId,
          result,
        });
        break;
      }
      case "d": {
        triggerFinish(parsedData);
        break;
      }
      case "e":
      case "3": {
        const err =
          typeof parsedData === "string"
            ? parsedData
            : parsedData?.message ||
              parsedData?.error ||
              parsedData?.errorText ||
              JSON.stringify(parsedData);
        onErrorPart?.(err);
        break;
      }
    }
  };

  let streamEndedCleanly = false;
  try {
    while (true) {
      if (abortSignal?.aborted) {
        throw new Error("aborted");
      }

      const { done, value } = await reader.read();
      if (done) {
        streamEndedCleanly = true;
        break;
      }

      if (typeof value === "string") {
        buffer += value;
      } else if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
        buffer += decoder.decode(value, { stream: true });
      }

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        processLine(line);
      }
    }

    if (streamEndedCleanly) {
      buffer += decoder.decode();
      if (buffer.trim()) {
        const line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
        processLine(line);
      }
      triggerFinish();
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Vercel AI SDK DataStream Protocol Simulators and Parsers
 */

export interface ParsedStreamChunk {
  type: "text" | "reasoning" | "tool_call" | "tool_result" | "finish" | "error" | "custom";
  rawPrefix: string;
  data: any;
}

export interface StreamSessionState {
  text: string;
  reasoning: string;
  toolCalls: Array<{ toolCallId: string; toolName?: string; name?: string; args: any }>;
  toolResults: Array<{ toolCallId: string; result: any }>;
  finishReason?: string;
  error?: string;
  usage?: { promptTokens: number; completionTokens: number };
  isFinished: boolean;
}

export function encodeDataStreamChunk(prefix: string, data: any): string {
  const payload = typeof data === "string" ? JSON.stringify(data) : JSON.stringify(data);
  return `${prefix}:${payload}\n`;
}

export function createGemini3ThinkingStream(options: {
  thinkingParts: string[];
  responseParts: string[];
  toolCalls?: Array<{ toolCallId: string; toolName: string; args: any; result: any }>;
}): string {
  let stream = "";

  // 1. Thinking phase (reasoning-delta)
  for (const part of options.thinkingParts) {
    stream += encodeDataStreamChunk("g", part);
  }

  // 2. Tool calls if any
  if (options.toolCalls) {
    for (const call of options.toolCalls) {
      stream += encodeDataStreamChunk("9", {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        args: call.args,
      });
      stream += encodeDataStreamChunk("a", {
        toolCallId: call.toolCallId,
        result: call.result,
      });
    }
  }

  // 3. Response text phase (text-delta)
  for (const part of options.responseParts) {
    stream += encodeDataStreamChunk("0", part);
  }

  // 4. Finish chunk
  stream += encodeDataStreamChunk("d", {
    finishReason: "stop",
    usage: { promptTokens: 128, completionTokens: 256 },
  });

  return stream;
}

export function parseDataStreamResponse(rawStream: string): ParsedStreamChunk[] {
  const lines = rawStream.split("\n").filter((l) => l.trim().length > 0);
  const chunks: ParsedStreamChunk[] = [];

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const prefix = line.slice(0, colonIdx);
    const rawData = line.slice(colonIdx + 1);

    let parsedData: any;
    try {
      parsedData = JSON.parse(rawData);
    } catch {
      parsedData = rawData;
    }

    switch (prefix) {
      case "0":
        chunks.push({ type: "text", rawPrefix: prefix, data: parsedData });
        break;
      case "g":
        chunks.push({ type: "reasoning", rawPrefix: prefix, data: parsedData });
        break;
      case "9":
      case "b":
        chunks.push({ type: "tool_call", rawPrefix: prefix, data: parsedData });
        break;
      case "a":
      case "c":
        chunks.push({ type: "tool_result", rawPrefix: prefix, data: parsedData });
        break;
      case "d":
        chunks.push({ type: "finish", rawPrefix: prefix, data: parsedData });
        break;
      case "e":
      case "3":
        chunks.push({ type: "error", rawPrefix: prefix, data: parsedData });
        break;
      default:
        chunks.push({ type: "custom", rawPrefix: prefix, data: parsedData });
    }
  }

  return chunks;
}

export function accumulateStreamState(chunks: ParsedStreamChunk[]): StreamSessionState {
  const state: StreamSessionState = {
    text: "",
    reasoning: "",
    toolCalls: [],
    toolResults: [],
    isFinished: false,
  };

  for (const chunk of chunks) {
    if (chunk.type === "text") {
      state.text += typeof chunk.data === "string" ? chunk.data : JSON.stringify(chunk.data);
    } else if (chunk.type === "reasoning") {
      state.reasoning += typeof chunk.data === "string" ? chunk.data : (chunk.data?.reasoning ?? JSON.stringify(chunk.data));
    } else if (chunk.type === "tool_call") {
      const callData = {
        ...chunk.data,
        name: chunk.data?.toolName || chunk.data?.name,
      };
      state.toolCalls.push(callData);
    } else if (chunk.type === "tool_result") {
      state.toolResults.push(chunk.data);
    } else if (chunk.type === "error") {
      state.error = typeof chunk.data === "string" ? chunk.data : JSON.stringify(chunk.data);
    } else if (chunk.type === "finish") {
      state.finishReason = chunk.data?.finishReason;
      state.usage = chunk.data?.usage;
      state.isFinished = true;
    }
  }

  return state;
}

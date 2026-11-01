import fs from "node:fs";
import path from "node:path";

export const PROJECT_ROOT = process.cwd();

export function readProjectFile(relativePath: string): string {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File does not exist: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, "utf-8");
}

export function readJsonFile<T = any>(relativePath: string): T {
  const content = readProjectFile(relativePath);
  return JSON.parse(content);
}

export function fileExists(relativePath: string): boolean {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  return fs.existsSync(fullPath);
}

export function directoryExists(relativePath: string): boolean {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
}

export function listDirFiles(relativePath: string): string[] {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return [];
  return fs.readdirSync(fullPath);
}

export interface ChatApiPayload {
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content:
      string | Array<{ type: "text" | "image"; text?: string; image?: string }>;
  }>;
  model: string;
  provider: "openai" | "google" | "anthropic" | "custom";
  modelConfig?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    reasoningConfig?: {
      thinkingLevel?: "minimal" | "low" | "medium" | "high";
      thinkingBudget?: number;
    };
  };
  customConfig?: {
    apiKey?: string;
    baseUrl?: string;
  };
  pluginIds?: string[];
}

export function validateChatApiPayload(payload: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Payload must be an object"] };
  }

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    errors.push("messages must be a non-empty array");
  } else {
    for (let i = 0; i < payload.messages.length; i++) {
      const msg = payload.messages[i];
      if (!msg || typeof msg !== "object") {
        errors.push(`message[${i}] must be an object`);
        continue;
      }
      if (!["system", "user", "assistant", "tool"].includes(msg.role)) {
        errors.push(`message[${i}].role invalid: ${msg.role}`);
      }
      if (typeof msg.content !== "string" && !Array.isArray(msg.content)) {
        errors.push(`message[${i}].content must be string or array of parts`);
      }
    }
  }

  if (!payload.model || typeof payload.model !== "string") {
    errors.push("model must be a non-empty string");
  }

  if (
    !payload.provider ||
    !["openai", "google", "anthropic", "custom"].includes(payload.provider)
  ) {
    errors.push(`provider invalid: ${payload.provider}`);
  }

  if (payload.modelConfig) {
    if (payload.modelConfig.temperature !== undefined) {
      if (
        typeof payload.modelConfig.temperature !== "number" ||
        payload.modelConfig.temperature < 0 ||
        payload.modelConfig.temperature > 2
      ) {
        errors.push("temperature must be number between 0 and 2");
      }
    }
    if (payload.modelConfig.top_p !== undefined) {
      if (
        typeof payload.modelConfig.top_p !== "number" ||
        payload.modelConfig.top_p < 0 ||
        payload.modelConfig.top_p > 1
      ) {
        errors.push("top_p must be number between 0 and 1");
      }
    }
    if (payload.modelConfig.reasoningConfig) {
      const rc = payload.modelConfig.reasoningConfig;
      if (
        rc.thinkingLevel &&
        !["minimal", "low", "medium", "high"].includes(rc.thinkingLevel)
      ) {
        errors.push(`thinkingLevel invalid: ${rc.thinkingLevel}`);
      }
      if (
        rc.thinkingBudget !== undefined &&
        (typeof rc.thinkingBudget !== "number" || rc.thinkingBudget < 0)
      ) {
        errors.push("thinkingBudget must be positive number");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

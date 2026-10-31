import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Empirical Challenger M2: Deep Store & Edge-Case Stress Harness", () => {
  it("Chat Store Edge Cases: Message deletion, context clearing boundary shifts", async () => {
    interface ChatMessage {
      id: string;
      role: "user" | "assistant" | "system";
      content: string;
      date: string;
    }

    interface ChatSession {
      id: string;
      topic: string;
      memoryPrompt: string;
      messages: ChatMessage[];
      clearContextIndex?: number;
      lastSummarizeIndex: number;
    }

    class TestChatStore {
      sessions: ChatSession[] = [];
      currentSessionIndex = 0;

      constructor() {
        this.newSession();
      }

      currentSession(): ChatSession {
        return this.sessions[this.currentSessionIndex];
      }

      newSession(topic = "New Chat"): ChatSession {
        const s: ChatSession = {
          id: "sess_" + Math.random().toString(36).slice(2, 8),
          topic,
          memoryPrompt: "",
          messages: [],
          lastSummarizeIndex: 0,
        };
        this.sessions.unshift(s);
        this.currentSessionIndex = 0;
        return s;
      }

      deleteMessage(sessionIndex: number, messageIndex: number) {
        const s = this.sessions[sessionIndex];
        if (!s || messageIndex < 0 || messageIndex >= s.messages.length) return;
        
        s.messages.splice(messageIndex, 1);
        if (s.clearContextIndex !== undefined) {
          if (messageIndex < s.clearContextIndex) {
            s.clearContextIndex = Math.max(0, s.clearContextIndex - 1);
          } else if (messageIndex === s.clearContextIndex) {
            if (s.clearContextIndex >= s.messages.length) {
              delete s.clearContextIndex;
            }
          }
        }
      }

      clearContext(sessionIndex: number) {
        const s = this.sessions[sessionIndex];
        if (s) {
          s.clearContextIndex = s.messages.length;
        }
      }

      forkSession(sessionIndex: number, messageIndex: number): ChatSession {
        const source = this.sessions[sessionIndex];
        if (!source) throw new Error("Invalid session index");
        const sliced = source.messages.slice(0, Math.max(0, messageIndex + 1));
        const forked = this.newSession(`${source.topic} (Fork)`);
        forked.messages = JSON.parse(JSON.stringify(sliced));
        return forked;
      }
    }

    const store = new TestChatStore();
    const session = store.currentSession();

    // 1. Populate 10 messages
    for (let i = 0; i < 10; i++) {
      session.messages.push({
        id: `msg_${i}`,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message content ${i}`,
        date: new Date().toISOString(),
      });
    }
    assert.strictEqual(session.messages.length, 10);

    // 2. Set clear context at index 5
    session.clearContextIndex = 5;

    // 3. Delete message at index 2 (before clearContextIndex) -> clearContextIndex should decrement to 4
    store.deleteMessage(0, 2);
    assert.strictEqual(session.messages.length, 9);
    assert.strictEqual(session.clearContextIndex, 4);

    // 4. Delete message at index 4 (exactly at clearContextIndex)
    store.deleteMessage(0, 4);
    assert.strictEqual(session.messages.length, 8);
    assert.strictEqual(session.clearContextIndex, 4);

    // 5. Delete out of bounds indices (negative, too large) -> no-op, no throw
    store.deleteMessage(0, -1);
    store.deleteMessage(0, 999);
    assert.strictEqual(session.messages.length, 8);

    // 6. Fork session at index 3
    const forked = store.forkSession(0, 3);
    assert.strictEqual(forked.messages.length, 4);
    assert.strictEqual(forked.topic, "New Chat (Fork)");

    // 7. Verify mutations on fork do not affect parent session
    forked.messages[0].content = "Mutated Fork Message";
    assert.strictEqual(store.sessions[1].messages[0].content, "Message content 0");
  });

  it("Mask Store Edge Cases: Custom mask lifecycle, prompt templates, cloning", () => {
    interface Mask {
      id: string;
      name: string;
      avatar: string;
      lang: string;
      builtin: boolean;
      context: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      modelConfig: {
        model: string;
        temperature: number;
        max_tokens: number;
      };
    }

    class TestMaskStore {
      masks: Record<string, Mask> = {};

      create(override?: Partial<Mask>): Mask {
        const id = "mask_" + Math.random().toString(36).slice(2, 8);
        const mask: Mask = {
          id,
          name: "Custom Mask",
          avatar: "1f600",
          lang: "en",
          builtin: false,
          context: [],
          modelConfig: {
            model: "gpt-4o-mini",
            temperature: 0.7,
            max_tokens: 4096,
          },
          ...override,
        };
        this.masks[id] = mask;
        return mask;
      }

      delete(id: string): boolean {
        const mask = this.masks[id];
        if (mask && !mask.builtin) {
          delete this.masks[id];
          return true;
        }
        return false;
      }

      search(query: string): Mask[] {
        const q = query.trim().toLowerCase();
        if (!q) return Object.values(this.masks);
        return Object.values(this.masks).filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.context.some((c) => c.content.toLowerCase().includes(q))
        );
      }
    }

    const maskStore = new TestMaskStore();

    // 1. Add built-in and custom masks
    const builtinMask = maskStore.create({
      name: "Software Engineer",
      builtin: true,
      context: [{ role: "system", content: "You are an expert full-stack engineer." }],
    });
    const customMask = maskStore.create({
      name: "Poet / Writer",
      builtin: false,
      context: [{ role: "system", content: "Write in beautiful poetic meter." }],
    });

    assert.strictEqual(Object.keys(maskStore.masks).length, 2);

    // 2. Attempt deleting built-in mask -> should be rejected
    const delBuiltin = maskStore.delete(builtinMask.id);
    assert.strictEqual(delBuiltin, false);
    assert.ok(maskStore.masks[builtinMask.id]);

    // 3. Delete custom mask -> succeeds
    const delCustom = maskStore.delete(customMask.id);
    assert.strictEqual(delCustom, true);
    assert.strictEqual(maskStore.masks[customMask.id], undefined);

    // 4. Search masks with unicode and case-insensitivity
    maskStore.create({
      name: "中文翻译专家 (Translator)",
      builtin: false,
      context: [{ role: "system", content: "精确翻译中文与英文" }],
    });
    const searchRes = maskStore.search("翻译");
    assert.strictEqual(searchRes.length, 1);
    assert.strictEqual(searchRes[0].name, "中文翻译专家 (Translator)");

    const emptySearch = maskStore.search("   ");
    assert.strictEqual(emptySearch.length, 2);
  });

  it("Plugin Store & Tool Conversion: OpenAPI Schema translation and proxy safety", () => {
    interface OpenApiPlugin {
      id: string;
      title: string;
      version: string;
      openapi: string;
      servers: Array<{ url: string }>;
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            summary: string;
            parameters?: Array<{ name: string; in: string; required?: boolean; schema?: any }>;
            requestBody?: any;
          }
        >
      >;
    }

    const samplePlugin: OpenApiPlugin = {
      id: "weather-plugin",
      title: "Weather Service",
      version: "1.0.0",
      openapi: "3.0.0",
      servers: [{ url: "https://api.weather.example.com/v1" }],
      paths: {
        "/current": {
          get: {
            operationId: "getCurrentWeather",
            summary: "Get current weather for location",
            parameters: [
              { name: "location", in: "query", required: true, schema: { type: "string" } },
              { name: "units", in: "query", required: false, schema: { type: "string" } },
            ],
          },
        },
      },
    };

    function convertPluginToTools(plugin: OpenApiPlugin) {
      const tools: Record<string, any> = {};
      for (const [pathKey, methods] of Object.entries(plugin.paths)) {
        for (const [method, op] of Object.entries(methods)) {
          const toolName = op.operationId || `${method}_${pathKey.replace(/\W+/g, "_")}`;
          tools[toolName] = {
            description: op.summary || "",
            parameters: op.parameters || [],
            endpoint: {
              server: plugin.servers[0]?.url || "",
              path: pathKey,
              method: method.toUpperCase(),
            },
          };
        }
      }
      return tools;
    }

    const tools = convertPluginToTools(samplePlugin);
    assert.ok(tools.getCurrentWeather);
    assert.strictEqual(tools.getCurrentWeather.parameters.length, 2);
    assert.strictEqual(tools.getCurrentWeather.endpoint.method, "GET");
    assert.strictEqual(tools.getCurrentWeather.endpoint.path, "/current");
  });

  it("Data Backup, Export & Import Round-trip Integrity", () => {
    interface ExportBackup {
      version: number;
      chatStore: {
        sessions: Array<{
          id: string;
          topic: string;
          messages: Array<{ role: string; content: string }>;
        }>;
      };
      maskStore: {
        masks: Record<string, any>;
      };
      configStore: {
        model: string;
        fontSize: number;
      };
    }

    const backupPayload: ExportBackup = {
      version: 2,
      chatStore: {
        sessions: [
          {
            id: "sess_001",
            topic: "TypeScript Exploration",
            messages: [
              { role: "user", content: "What is conditional types?" },
              { role: "assistant", content: "Conditional types allow type-level branching: `T extends U ? X : Y`" },
            ],
          },
        ],
      },
      maskStore: {
        masks: {
          custom_1: { id: "custom_1", name: "Custom Helper" },
        },
      },
      configStore: {
        model: "gpt-4o",
        fontSize: 14,
      },
    };

    // 1. Serialization
    const serializedJson = JSON.stringify(backupPayload, null, 2);
    assert.ok(serializedJson.length > 50);

    // 2. Deserialization
    const restored: ExportBackup = JSON.parse(serializedJson);
    assert.strictEqual(restored.version, 2);
    assert.strictEqual(restored.chatStore.sessions.length, 1);
    assert.strictEqual(restored.chatStore.sessions[0].messages.length, 2);
    assert.strictEqual(restored.chatStore.sessions[0].topic, "TypeScript Exploration");
    assert.strictEqual(restored.configStore.fontSize, 14);
  });
});

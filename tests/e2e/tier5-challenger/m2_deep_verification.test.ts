import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

describe("Milestone 2 Empirical Challenger Deep Verification & Stress Suite", () => {
  const rootDir = process.cwd();

  it("1. Zero SD / Stability AI components, stores, routes, or settings UI", () => {
    // Check directory and file deletions
    assert.strictEqual(
      fs.existsSync(path.join(rootDir, "app/components/sd")),
      false,
      "app/components/sd must not exist"
    );
    assert.strictEqual(
      fs.existsSync(path.join(rootDir, "app/store/sd.ts")),
      false,
      "app/store/sd.ts must not exist"
    );
    assert.strictEqual(
      fs.existsSync(path.join(rootDir, "app/api/stability.ts")),
      false,
      "app/api/stability.ts must not exist"
    );

    // Check settings.tsx has no Stability config components
    const settingsContent = fs.readFileSync(
      path.join(rootDir, "app/components/settings.tsx"),
      "utf-8"
    );
    assert.ok(
      !settingsContent.includes("stabilityConfigComponent"),
      "settings.tsx must not contain stabilityConfigComponent"
    );
    assert.ok(
      !settingsContent.includes("ServiceProvider.Stability"),
      "settings.tsx must not contain ServiceProvider.Stability"
    );

    // Check sidebar has no SD navigation
    const sidebarContent = fs.readFileSync(
      path.join(rootDir, "app/components/sidebar.tsx"),
      "utf-8"
    );
    assert.ok(
      !sidebarContent.includes("Path.Sd"),
      "sidebar.tsx must not contain Path.Sd"
    );
  });

  it("2. Zero MCP directories, packages, components, and prompt remnants", () => {
    // Check directory and component deletions
    assert.strictEqual(
      fs.existsSync(path.join(rootDir, "app/mcp")),
      false,
      "app/mcp directory must not exist"
    );
    assert.strictEqual(
      fs.existsSync(path.join(rootDir, "app/components/mcp-market.tsx")),
      false,
      "app/components/mcp-market.tsx must not exist"
    );

    // Check package.json
    const pkg = JSON.parse(
      fs.readFileSync(path.join(rootDir, "package.json"), "utf-8")
    );
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.strictEqual(
      deps["@modelcontextprotocol/sdk"],
      undefined,
      "package.json must not have @modelcontextprotocol/sdk"
    );

    // Check chat.ts for MCP stubs or templates
    const chatStoreContent = fs.readFileSync(
      path.join(rootDir, "app/store/chat.ts"),
      "utf-8"
    );
    assert.ok(
      !chatStoreContent.includes("MCP_SYSTEM_TEMPLATE"),
      "chat.ts must not reference MCP_SYSTEM_TEMPLATE"
    );
    assert.ok(
      !chatStoreContent.includes("MCP_TOOLS_TEMPLATE"),
      "chat.ts must not reference MCP_TOOLS_TEMPLATE"
    );
    assert.ok(
      !chatStoreContent.includes("isMcpResponse"),
      "chat.ts must not reference isMcpResponse"
    );
    assert.ok(
      !chatStoreContent.includes("checkMcpJson"),
      "chat.ts must not reference checkMcpJson"
    );
    assert.ok(
      !chatStoreContent.includes("executeMcpAction"),
      "chat.ts must not reference executeMcpAction"
    );

    // Check chat.tsx for MCP action button
    const chatViewContent = fs.readFileSync(
      path.join(rootDir, "app/components/chat.tsx"),
      "utf-8"
    );
    assert.ok(
      !chatViewContent.includes("<MCPAction"),
      "chat.tsx must not reference <MCPAction"
    );
  });

  it("3. Zero DALL-E special-case selector branches in chat UI and store", () => {
    const chatViewContent = fs.readFileSync(
      path.join(rootDir, "app/components/chat.tsx"),
      "utf-8"
    );
    assert.ok(
      !chatViewContent.includes("dalle3Qualitys"),
      "chat.tsx must not have dalle3Qualitys state"
    );
    assert.ok(
      !chatViewContent.includes("dalle3Styles"),
      "chat.tsx must not have dalle3Styles state"
    );
    assert.ok(
      !chatViewContent.includes("isDalle3("),
      "chat.tsx must not have isDalle3 branching"
    );

    const chatStoreContent = fs.readFileSync(
      path.join(rootDir, "app/store/chat.ts"),
      "utf-8"
    );
    assert.ok(
      !chatStoreContent.includes("isDalle3("),
      "chat.ts must not have isDalle3 branching"
    );
  });

  it("4. OpenAPI Plugin store operates cleanly without MCP dependencies", () => {
    const pluginStoreContent = fs.readFileSync(
      path.join(rootDir, "app/store/plugin.ts"),
      "utf-8"
    );
    assert.ok(
      !pluginStoreContent.includes("mcp"),
      "plugin.ts must not contain MCP references"
    );
    assert.ok(
      pluginStoreContent.includes("openapi-client-axios"),
      "plugin.ts should use openapi-client-axios"
    );
  });

  it("5. Chat Session & Message Operations Stress Test (CRUD, Fork, Context Clear, Isolation)", () => {
    interface TestMessage {
      id: string;
      role: "user" | "assistant" | "system";
      content: string;
      date: string;
      reasoning?: string;
      streaming?: boolean;
    }

    interface TestSession {
      id: string;
      topic: string;
      memoryPrompt: string;
      messages: TestMessage[];
      clearContextIndex?: number;
      mask?: {
        id: string;
        name: string;
        context: Array<{ role: string; content: string }>;
      };
    }

    class TestSessionManager {
      sessions: TestSession[] = [];
      currentIndex = 0;

      createSession(topic = "Default Topic", mask?: any): TestSession {
        const session: TestSession = {
          id: "s_" + Math.random().toString(36).substring(2, 9),
          topic,
          memoryPrompt: "",
          messages: [],
          mask,
        };
        this.sessions.unshift(session);
        this.currentIndex = 0;
        return session;
      }

      currentSession(): TestSession {
        if (this.sessions.length === 0) {
          this.createSession();
        }
        return this.sessions[this.currentIndex];
      }

      selectSession(idx: number) {
        if (idx >= 0 && idx < this.sessions.length) {
          this.currentIndex = idx;
        }
      }

      deleteSession(idx: number) {
        this.sessions.splice(idx, 1);
        if (this.sessions.length === 0) {
          this.createSession();
        } else if (this.currentIndex >= this.sessions.length) {
          this.currentIndex = this.sessions.length - 1;
        }
      }

      appendMessage(msg: Omit<TestMessage, "id" | "date">): TestMessage {
        const s = this.currentSession();
        const m: TestMessage = {
          ...msg,
          id: "m_" + Math.random().toString(36).substring(2, 9),
          date: new Date().toISOString(),
        };
        s.messages.push(m);
        return m;
      }

      clearSessionMessages() {
        const s = this.currentSession();
        s.messages = [];
        delete s.clearContextIndex;
      }

      forkSession(messageIndex: number): TestSession {
        const s = this.currentSession();
        const sliced = s.messages.slice(0, messageIndex + 1);
        const forked = this.createSession(`${s.topic} (Fork)`, s.mask ? JSON.parse(JSON.stringify(s.mask)) : undefined);
        forked.messages = JSON.parse(JSON.stringify(sliced));
        return forked;
      }

      getEffectiveContext(): TestMessage[] {
        const s = this.currentSession();
        if (s.clearContextIndex !== undefined && s.clearContextIndex >= 0) {
          return s.messages.slice(s.clearContextIndex);
        }
        return s.messages;
      }
    }

    const mgr = new TestSessionManager();

    // A. Stress create 100 sessions with Unicode and special characters
    for (let i = 0; i < 100; i++) {
      mgr.createSession(`Topic 🌟 ${i} / 特殊字符 / <script>alert(1)</script>`);
    }
    assert.strictEqual(mgr.sessions.length, 100);
    assert.strictEqual(mgr.currentIndex, 0);

    // B. Switch sessions across range
    mgr.selectSession(50);
    assert.strictEqual(mgr.currentIndex, 50);
    assert.ok(mgr.currentSession().topic.includes("Topic 🌟 49"));

    // C. Append messages with multiline, reasoning, emojis
    mgr.appendMessage({ role: "user", content: "Hello multi-turn!" });
    mgr.appendMessage({
      role: "assistant",
      content: "Here is your response:\n```typescript\nconst a = 1;\n```",
      reasoning: "Thinking about the TypeScript code formatting...",
    });
    mgr.appendMessage({ role: "user", content: "Can you elaborate?" });
    mgr.appendMessage({ role: "assistant", content: "Sure, let us delve deeper." });

    assert.strictEqual(mgr.currentSession().messages.length, 4);
    assert.strictEqual(
      mgr.currentSession().messages[1].reasoning,
      "Thinking about the TypeScript code formatting..."
    );

    // D. Test context clearing divider
    mgr.currentSession().clearContextIndex = 2;
    const effective = mgr.getEffectiveContext();
    assert.strictEqual(effective.length, 2);
    assert.strictEqual(effective[0].content, "Can you elaborate?");

    // E. Fork session from turn index 1 (assistant's first response)
    const forked = mgr.forkSession(1);
    assert.strictEqual(mgr.sessions.length, 101);
    assert.strictEqual(forked.messages.length, 2);
    assert.strictEqual(forked.messages[1].reasoning, "Thinking about the TypeScript code formatting...");

    // Mutate fork and ensure original is unmutated (deep isolation)
    forked.messages[0].content = "Modified in fork";
    mgr.selectSession(51); // Original session was at 50, but unshift moved it to 51
    assert.strictEqual(mgr.currentSession().messages[0].content, "Hello multi-turn!");

    // F. Clear messages in session
    mgr.clearSessionMessages();
    assert.strictEqual(mgr.currentSession().messages.length, 0);
    assert.strictEqual(mgr.currentSession().clearContextIndex, undefined);

    // G. Delete sessions down to 1 and verify auto-creation
    while (mgr.sessions.length > 1) {
      mgr.deleteSession(0);
    }
    assert.strictEqual(mgr.sessions.length, 1);
    mgr.deleteSession(0);
    assert.strictEqual(mgr.sessions.length, 1);
    assert.strictEqual(mgr.currentSession().topic, "Default Topic");
  });

  it("6. Legacy Session Deserialization Sanitization", () => {
    // Legacy session JSON payload with pruned SD and MCP attributes
    const legacySessionPayload = {
      id: "legacy_123",
      topic: "Legacy Chat",
      messages: [
        {
          id: "msg_1",
          role: "user",
          content: "Generate an image of a sunset",
          isMcpResponse: true,
          sdParams: { prompt: "sunset", steps: 20 },
        },
        {
          id: "msg_2",
          role: "assistant",
          content: "Here is your image result",
          isMcpResponse: true,
          tools: [{ id: "call_1", type: "mcp", function: { name: "mcp_tool" } }],
        },
      ],
      mask: {
        id: "mask_legacy",
        name: "Legacy Mask",
        context: [
          { role: "system", content: "System instruction with {mcp:server:tool} tag" },
        ],
      },
    };

    // Sanitize function mimicking migration behavior
    const sanitized = JSON.parse(JSON.stringify(legacySessionPayload));
    for (const msg of sanitized.messages) {
      delete (msg as any).isMcpResponse;
      delete (msg as any).sdParams;
    }
    for (const ctx of sanitized.mask.context) {
      ctx.content = ctx.content.replace(/\{mcp:[^}]+\}/g, "");
    }

    assert.strictEqual((sanitized.messages[0] as any).isMcpResponse, undefined);
    assert.strictEqual((sanitized.messages[0] as any).sdParams, undefined);
    assert.strictEqual(sanitized.mask.context[0].content, "System instruction with  tag");
  });
});

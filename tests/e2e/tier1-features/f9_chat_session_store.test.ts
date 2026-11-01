import { describe, it } from "node:test";
import assert from "node:assert";

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  date: string;
  streaming?: boolean;
  model?: string;
  reasoning?: string;
}

interface ChatSession {
  id: string;
  topic: string;
  memoryPrompt: string;
  messages: Message[];
  createdAt: number;
  mask?: {
    id: string;
    name: string;
    avatar: string;
    context: Array<{ role: string; content: string }>;
  };
}

class MockChatSessionManager {
  sessions: ChatSession[] = [];
  currentSessionIndex: number = 0;

  createSession(topic = "New Conversation", mask?: any): ChatSession {
    const session: ChatSession = {
      id: "session_" + Math.random().toString(36).substring(2, 9),
      topic,
      memoryPrompt: "",
      messages: [],
      createdAt: Date.now(),
      mask,
    };
    this.sessions.unshift(session);
    this.currentSessionIndex = 0;
    return session;
  }

  currentSession(): ChatSession | undefined {
    return this.sessions[this.currentSessionIndex];
  }

  selectSession(index: number) {
    if (index >= 0 && index < this.sessions.length) {
      this.currentSessionIndex = index;
    }
  }

  deleteSession(index: number) {
    this.sessions.splice(index, 1);
    if (this.currentSessionIndex >= this.sessions.length) {
      this.currentSessionIndex = Math.max(0, this.sessions.length - 1);
    }
  }

  appendMessage(message: Omit<Message, "id" | "date">): Message {
    const session = this.currentSession();
    if (!session) throw new Error("No active session");
    const newMsg: Message = {
      ...message,
      id: "msg_" + Math.random().toString(36).substring(2, 9),
      date: new Date().toISOString(),
    };
    session.messages.push(newMsg);
    return newMsg;
  }

  clearAllMessages() {
    const session = this.currentSession();
    if (session) {
      session.messages = [];
    }
  }

  forkSession(messageIndex: number): ChatSession {
    const session = this.currentSession();
    if (!session) throw new Error("No active session");
    const slicedMessages = session.messages.slice(0, messageIndex + 1);
    const forked = this.createSession(`${session.topic} (Fork)`, session.mask);
    forked.messages = JSON.parse(JSON.stringify(slicedMessages));
    return forked;
  }
}

describe("Feature F9: Multi-Turn Chat & Session Management Store", () => {
  it("F9-1: creates a new chat session with default attributes and selects it", () => {
    const manager = new MockChatSessionManager();
    const session = manager.createSession("Project Design");

    assert.ok(session.id.startsWith("session_"));
    assert.strictEqual(session.topic, "Project Design");
    assert.strictEqual(session.messages.length, 0);
    assert.strictEqual(manager.currentSession()?.id, session.id);
  });

  it("F9-2: appends multi-turn messages and preserves role order (user, assistant, tool)", () => {
    const manager = new MockChatSessionManager();
    manager.createSession();

    const m1 = manager.appendMessage({ role: "user", content: "What is 2+2?" });
    const m2 = manager.appendMessage({
      role: "assistant",
      content: "2 + 2 = 4",
      reasoning: "Basic math addition.",
    });
    const m3 = manager.appendMessage({
      role: "user",
      content: "Multiply by 10",
    });
    const m4 = manager.appendMessage({
      role: "assistant",
      content: "4 * 10 = 40",
    });

    const session = manager.currentSession()!;
    assert.strictEqual(session.messages.length, 4);
    assert.strictEqual(session.messages[0].content, "What is 2+2?");
    assert.strictEqual(session.messages[1].reasoning, "Basic math addition.");
    assert.strictEqual(session.messages[3].content, "4 * 10 = 40");
  });

  it("F9-3: switches active sessions and manages deletion gracefully", () => {
    const manager = new MockChatSessionManager();
    const s1 = manager.createSession("Session 1");
    const s2 = manager.createSession("Session 2");

    assert.strictEqual(manager.currentSession()?.topic, "Session 2");
    manager.selectSession(1);
    assert.strictEqual(manager.currentSession()?.topic, "Session 1");

    manager.deleteSession(1);
    assert.strictEqual(manager.sessions.length, 1);
    assert.strictEqual(manager.currentSession()?.topic, "Session 2");
  });

  it("F9-4: supports Mask / persona assignment with system context", () => {
    const manager = new MockChatSessionManager();
    const personaMask = {
      id: "mask_coder",
      name: "Senior Software Engineer",
      avatar: "1f4bb",
      context: [
        { role: "system", content: "You are an expert TypeScript architect." },
      ],
    };

    const session = manager.createSession("Coding Help", personaMask);
    assert.ok(session.mask);
    assert.strictEqual(session.mask.name, "Senior Software Engineer");
    assert.strictEqual(
      session.mask.context[0].content,
      "You are an expert TypeScript architect.",
    );
  });

  it("F9-5: supports forking session at specific turn and clearing history", () => {
    const manager = new MockChatSessionManager();
    manager.createSession("Original");
    manager.appendMessage({ role: "user", content: "Step 1" });
    manager.appendMessage({ role: "assistant", content: "Done 1" });
    manager.appendMessage({ role: "user", content: "Step 2" });
    manager.appendMessage({ role: "assistant", content: "Done 2" });

    // Fork at Step 1 done (index 1)
    const forked = manager.forkSession(1);
    assert.strictEqual(forked.messages.length, 2);
    assert.strictEqual(forked.messages[1].content, "Done 1");
    assert.strictEqual(forked.topic, "Original (Fork)");

    // Clear original
    manager.selectSession(1);
    manager.clearAllMessages();
    assert.strictEqual(manager.currentSession()?.messages.length, 0);
  });
});

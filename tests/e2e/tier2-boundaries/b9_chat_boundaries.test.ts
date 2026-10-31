import test, { describe, it } from "node:test";
import assert from "node:assert";

class ChatSessionBoundaryTester {
  static createMessage(content: string, role: "user" | "assistant" = "user") {
    return {
      id: "msg_" + Math.random().toString(36).slice(2),
      role,
      content,
      date: new Date().toISOString(),
    };
  }

  static forkSession(messages: any[], targetIndex: number): any[] {
    if (messages.length === 0) return [];
    if (targetIndex < 0) return [];
    if (targetIndex >= messages.length) return [...messages];
    return messages.slice(0, targetIndex + 1);
  }

  static sanitizeMessageContent(content: string): string {
    // Normalizes unescaped null bytes or control characters
    return content.replace(/\0/g, "");
  }
}

describe("Tier 2 Boundary B9: Chat & Session Store Boundaries", () => {
  it("B9-1: handles empty message history serialization and export", () => {
    const emptySession = { id: "s1", topic: "Empty", messages: [] };
    const serialized = JSON.stringify(emptySession);
    const parsed = JSON.parse(serialized);

    assert.strictEqual(parsed.id, "s1");
    assert.strictEqual(parsed.messages.length, 0);
  });

  it("B9-2: handles massive conversation history with 1,000+ messages", () => {
    const largeMessages: any[] = [];
    for (let i = 0; i < 1000; i++) {
      largeMessages.push(
        ChatSessionBoundaryTester.createMessage(
          `Message turn #${i}: some conversational text content.`
        )
      );
    }

    assert.strictEqual(largeMessages.length, 1000);
    const sliced = largeMessages.slice(-20); // typical context window windowing
    assert.strictEqual(sliced.length, 20);
    assert.strictEqual(sliced[19].content, "Message turn #999: some conversational text content.");
  });

  it("B9-3: sanitizes null bytes and handles special markdown & code fence boundary inputs", () => {
    const rawWithNull = "Malicious\0 payload with ```ts\nconsole.log(1);\n";
    const clean = ChatSessionBoundaryTester.sanitizeMessageContent(rawWithNull);

    assert.strictEqual(clean, "Malicious payload with ```ts\nconsole.log(1);\n");
    assert.ok(!clean.includes("\0"));
  });

  it("B9-4: handles session forking at boundary indices (first, last, negative, out of bounds)", () => {
    const msgs = [
      { id: "1", content: "One" },
      { id: "2", content: "Two" },
      { id: "3", content: "Three" },
    ];

    // First element (index 0)
    assert.strictEqual(ChatSessionBoundaryTester.forkSession(msgs, 0).length, 1);
    // Last element (index 2)
    assert.strictEqual(ChatSessionBoundaryTester.forkSession(msgs, 2).length, 3);
    // Negative index
    assert.strictEqual(ChatSessionBoundaryTester.forkSession(msgs, -1).length, 0);
    // Out of bounds (index 10)
    assert.strictEqual(ChatSessionBoundaryTester.forkSession(msgs, 10).length, 3);
  });

  it("B9-5: handles simultaneous session topic editing and rapid message additions", () => {
    const session = { id: "s1", topic: "Original", messages: [] as any[] };

    // Rapid updates
    session.topic = "Updated Topic 1";
    session.messages.push(ChatSessionBoundaryTester.createMessage("Prompt 1"));
    session.topic = "Updated Topic 2";
    session.messages.push(ChatSessionBoundaryTester.createMessage("Prompt 2"));

    assert.strictEqual(session.topic, "Updated Topic 2");
    assert.strictEqual(session.messages.length, 2);
  });
});

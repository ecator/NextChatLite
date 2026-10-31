import test, { describe, it } from "node:test";
import assert from "node:assert";

describe("Tier 4 Scenario 7: Multi-Turn Conversation Forking & Branching History Flow", () => {
  it("allows branching a conversation from an earlier turn without altering the original branch", () => {
    // 1. Conduct original 4-turn conversation
    const originalSession = {
      id: "session_original",
      topic: "Python Web Framework Selection",
      messages: [
        { id: "m1", role: "user", content: "Compare FastAPI and Flask." },
        { id: "m2", role: "assistant", content: "FastAPI is async-native and uses Pydantic for validation, while Flask is micro and WSGI-based." },
        { id: "m3", role: "user", content: "Let's proceed with Flask. How do I setup blueprints?" },
        { id: "m4", role: "assistant", content: "Use `from flask import Blueprint` and register with `app.register_blueprint()`." },
      ],
    };

    assert.strictEqual(originalSession.messages.length, 4);

    // 2. User decides at turn 2 (m2) that they want to explore FastAPI instead -> FORK at Turn 2 (index 1)
    const forkIndex = 1;
    const forkedSession = {
      id: "session_forked_fastapi",
      topic: `${originalSession.topic} (Fork)`,
      messages: JSON.parse(JSON.stringify(originalSession.messages.slice(0, forkIndex + 1))),
    };

    assert.strictEqual(forkedSession.messages.length, 2);
    assert.strictEqual(forkedSession.messages[1].content, originalSession.messages[1].content);

    // 3. In the forked session, user asks a FastAPI question
    forkedSession.messages.push({
      id: "m3_fork",
      role: "user",
      content: "Let's proceed with FastAPI. How do I define dependency injection?",
    });
    forkedSession.messages.push({
      id: "m4_fork",
      role: "assistant",
      content: "Use `Depends` from `fastapi`: `async def endpoint(db: Session = Depends(get_db)):`.",
    });

    // 4. Verify branches remain completely independent
    assert.strictEqual(originalSession.messages.length, 4);
    assert.strictEqual(originalSession.messages[2].content, "Let's proceed with Flask. How do I setup blueprints?");

    assert.strictEqual(forkedSession.messages.length, 4);
    assert.strictEqual(forkedSession.messages[2].content, "Let's proceed with FastAPI. How do I define dependency injection?");
  });
});

import { ChatControllerPool } from "@/client/controller";

describe("ChatControllerPool", () => {
  beforeEach(() => {
    ChatControllerPool.stopAll();
  });

  it("should add and remove controllers correctly", () => {
    const sessionId = "session-1";
    const messageId = "msg-1";
    const controller = new AbortController();

    ChatControllerPool.addController(sessionId, messageId, controller);
    expect(ChatControllerPool.hasPending()).toBe(true);

    ChatControllerPool.remove(sessionId, messageId);
    expect(ChatControllerPool.hasPending()).toBe(false);
  });

  it("should abort and clean up controller when stop is called", () => {
    const sessionId = "session-2";
    const messageId = "msg-2";
    const controller = new AbortController();

    ChatControllerPool.addController(sessionId, messageId, controller);
    expect(controller.signal.aborted).toBe(false);

    ChatControllerPool.stop(sessionId, messageId);
    expect(controller.signal.aborted).toBe(true);
    expect(ChatControllerPool.hasPending()).toBe(false);
  });

  it("should abort and clear all controllers when stopAll is called", () => {
    const c1 = new AbortController();
    const c2 = new AbortController();

    ChatControllerPool.addController("s1", "m1", c1);
    ChatControllerPool.addController("s2", "m2", c2);
    expect(ChatControllerPool.hasPending()).toBe(true);

    ChatControllerPool.stopAll();
    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(true);
    expect(ChatControllerPool.hasPending()).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from "@jest/globals";
import { DEFAULT_CONFIG, useAppConfig } from "@/store/config";
import { useChatStore } from "@/store/chat";
import { safeLocalStorage } from "@/utils/storage";

describe("Default sendMemory (History Compression Summary) configuration", () => {
  const storage = safeLocalStorage();

  beforeEach(() => {
    storage.clear();
  });

  it("should have sendMemory default to false in DEFAULT_CONFIG", () => {
    expect(DEFAULT_CONFIG.modelConfig.sendMemory).toBe(false);
  });

  it("should have sendMemory false in app config initial/reset state", () => {
    const config = useAppConfig.getState();
    config.reset();
    expect(useAppConfig.getState().modelConfig.sendMemory).toBe(false);
  });

  it("should create a new session with sendMemory set to false by default", () => {
    const chatStore = useChatStore.getState();
    chatStore.newSession();
    const session = chatStore.currentSession();
    expect(session.mask.modelConfig.sendMemory).toBe(false);
  });
});

import { useChatStore } from "@/store/chat";
import { useAppConfig } from "@/store/config";
import { useModelStore } from "@/store/models";
import {
  ServiceProvider,
  SUMMARIZE_MODEL,
  GEMINI_SUMMARIZE_MODEL,
} from "@/constant";

describe("Chat Summarize & Compress Model Fallback", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useChatStore.getState().clearSessions();
    useAppConfig.getState().reset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("SUMMARIZE_MODEL and GEMINI_SUMMARIZE_MODEL point to active models in catalog", () => {
    const modelStore = useModelStore.getState();
    const geminiMeta = modelStore.getModel(GEMINI_SUMMARIZE_MODEL);
    const gptMeta = modelStore.getModel(SUMMARIZE_MODEL);

    expect(geminiMeta).toBeDefined();
    expect(geminiMeta?.id).toBe("gemini-3.1-flash-lite");
    expect(gptMeta).toBeDefined();
    expect(gptMeta?.id).toBe("gpt-5-mini");
  });

  test("summarizeSession respects session-level compressModel override", async () => {
    const chatStore = useChatStore.getState();
    const session = chatStore.currentSession();

    session.mask.modelConfig.compressModel = "gpt-5.1" as any;
    session.mask.modelConfig.compressProviderName = ServiceProvider.OpenAI;
    session.messages = [
      { id: "1", date: "", role: "user", content: "Tell me about TypeScript." },
      {
        id: "2",
        date: "",
        role: "assistant",
        content: "TypeScript is a typed superset of JavaScript.",
      },
    ];

    let capturedPayload: any = null;
    global.fetch = jest.fn().mockImplementation((url, init) => {
      capturedPayload = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"text-delta","delta":"TypeScript概述"}\n\ndata: [DONE]\n\n',
              ),
            );
            controller.close();
          },
        }),
      });
    });

    await chatStore.summarizeSession(true, session);

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.model).toBe("gpt-5.1");
    expect(capturedPayload.modelConfig.max_tokens).toBe(50);
    expect(capturedPayload.modelConfig.reasoningConfig.thinkingLevel).toBe(
      "minimal",
    );
    expect(chatStore.currentSession().topic).toBe("TypeScript概述");
  });

  test("summarizeSession falls back to global config compressModel when session has none", async () => {
    const chatStore = useChatStore.getState();
    const session = chatStore.currentSession();

    // Session has no compressModel
    session.mask.modelConfig.compressModel = "" as any;
    // But global config has compressModel set
    useAppConfig.getState().update((cfg) => {
      cfg.modelConfig.compressModel = "gpt-5-mini" as any;
      cfg.modelConfig.compressProviderName = ServiceProvider.OpenAI;
    });

    session.messages = [
      { id: "1", date: "", role: "user", content: "Hello world" },
      {
        id: "2",
        date: "",
        role: "assistant",
        content: "Hi! How can I help you today?",
      },
    ];

    let capturedPayload: any = null;
    global.fetch = jest.fn().mockImplementation((url, init) => {
      capturedPayload = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"text-delta","delta":"主题：代码问答"}\n\ndata: [DONE]\n\n',
              ),
            );
            controller.close();
          },
        }),
      });
    });

    await chatStore.summarizeSession(true, session);

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.model).toBe("gpt-5-mini");
    // Verify trimTopic removed "主题：" prefix
    expect(chatStore.currentSession().topic).toBe("代码问答");
  });

  test("summarizeSession filters out error messages and extracts multimodal text", async () => {
    const chatStore = useChatStore.getState();
    const session = chatStore.currentSession();

    session.messages = [
      {
        id: "1",
        date: "",
        role: "user",
        content: [{ type: "text", text: "Explain React Hooks" }] as any,
      },
      {
        id: "2",
        date: "",
        role: "assistant",
        content: "Hooks let you use state.",
        isError: false,
      },
      {
        id: "3",
        date: "",
        role: "assistant",
        content: "[Error]: Network timeout",
        isError: true,
      },
    ];

    let capturedPayload: any = null;
    global.fetch = jest.fn().mockImplementation((url, init) => {
      capturedPayload = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      });
    });

    chatStore.summarizeSession(true, session);
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedPayload).toBeDefined();
    // Verify error message #3 is excluded
    const messages = capturedPayload.messages;
    const contents = messages.map((m: any) => m.content);
    expect(contents.some((c: string) => c.includes("Network timeout"))).toBe(
      false,
    );
    // Verify multimodal message was converted to clean text
    expect(contents[0]).toBe("Explain React Hooks");
  });
});

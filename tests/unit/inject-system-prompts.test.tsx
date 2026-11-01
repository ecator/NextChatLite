import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { useChatStore } from "@/store/chat";
import { useAppConfig } from "@/store/config";
import { ModelConfigList } from "@/components/model-config";
import Locale from "@/locales";

jest.mock("../src/icons/down.svg", () => {
  const DownIcon = () => <svg data-testid="down-icon" />;
  DownIcon.displayName = "DownIcon";
  return DownIcon;
});

describe("System Prompt Injection across models", () => {
  beforeEach(() => {
    document.head
      .querySelectorAll("meta[name='config']")
      .forEach((m) => m.remove());
    useChatStore.getState().clearSessions();
    useAppConfig.getState().reset();
  });

  afterEach(() => {
    document.head
      .querySelectorAll("meta[name='config']")
      .forEach((m) => m.remove());
  });

  test("injects generic system prompt for non-GPT models when enabled", async () => {
    const chatStore = useChatStore.getState();
    const session = chatStore.currentSession();

    session.mask.modelConfig.model = "gemini-3.5-flash" as any;
    session.mask.modelConfig.providerName = "google" as any;
    session.mask.modelConfig.enableInjectSystemPrompts = true;

    session.messages = [
      {
        id: "msg-1",
        date: "",
        role: "user",
        content: "Hello",
      },
    ];

    const messages = await chatStore.getMessagesWithMemory();
    const systemMsg = messages.find((m) => m.role === "system");

    expect(systemMsg).toBeDefined();
    expect(systemMsg?.content).toContain("helpful AI assistant");
    expect(systemMsg?.content).not.toContain("ChatGPT");
    expect(systemMsg?.content).toContain("Google");
    expect(systemMsg?.content).toContain("gemini-3.5-flash");
  });

  test("does not inject system prompt when enableInjectSystemPrompts is false", async () => {
    const chatStore = useChatStore.getState();
    const session = chatStore.currentSession();

    session.mask.modelConfig.model = "gemini-3.5-flash" as any;
    session.mask.modelConfig.enableInjectSystemPrompts = false;

    session.messages = [
      {
        id: "msg-1",
        date: "",
        role: "user",
        content: "Hello",
      },
    ];

    const messages = await chatStore.getMessagesWithMemory();
    const systemMsg = messages.find((m) => m.role === "system");

    expect(systemMsg).toBeUndefined();
  });

  test("respects custom defaultSystemTemplate configured in client meta tag", async () => {
    const meta = document.createElement("meta");
    meta.name = "config";
    meta.content = JSON.stringify({
      defaultSystemTemplate:
        "Custom system: provider={{ServiceProvider}}, model={{model}}",
    });
    document.head.appendChild(meta);

    const chatStore = useChatStore.getState();
    const session = chatStore.currentSession();

    session.mask.modelConfig.model = "gemini-3.1-flash-lite" as any;
    session.mask.modelConfig.providerName = "google" as any;
    session.mask.modelConfig.enableInjectSystemPrompts = true;

    session.messages = [
      {
        id: "msg-1",
        date: "",
        role: "user",
        content: "Hello",
      },
    ];

    const messages = await chatStore.getMessagesWithMemory();
    const systemMsg = messages.find((m) => m.role === "system");

    expect(systemMsg).toBeDefined();
    expect(systemMsg?.content).toBe(
      "Custom system: provider=Google, model=gemini-3.1-flash-lite",
    );
  });

  test("renders InjectSystemPrompts switch in ModelConfigList for Google provider", () => {
    const dummyConfig = {
      ...useAppConfig.getState().modelConfig,
      model: "gemini-3.5-flash",
      providerName: "Google",
    };

    render(
      <ModelConfigList
        modelConfig={dummyConfig as any}
        updateConfig={jest.fn()}
      />,
    );

    const toggle = screen.getByLabelText(
      Locale.Settings.InjectSystemPrompts.Title,
    );
    expect(toggle).toBeInTheDocument();
  });

  test("renders InjectSystemPrompts switch in ModelConfigList for OpenAI provider", () => {
    const dummyConfig = {
      ...useAppConfig.getState().modelConfig,
      model: "gpt-5-mini",
      providerName: "OpenAI",
    };

    render(
      <ModelConfigList
        modelConfig={dummyConfig as any}
        updateConfig={jest.fn()}
      />,
    );

    const toggle = screen.getByLabelText(
      Locale.Settings.InjectSystemPrompts.Title,
    );
    expect(toggle).toBeInTheDocument();
  });
});

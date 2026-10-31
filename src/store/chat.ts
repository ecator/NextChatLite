import { getMessageTextContent, safeLocalStorage, trimTopic } from "../utils";

import { indexedDBStorage } from "@/utils/indexedDB-storage";
import { nanoid } from "nanoid";
import type { MultimodalContent, RequestMessage } from "../client/api";
import { ChatControllerPool } from "../client/controller";
import { showToast } from "../components/ui-lib";
import {
  DEFAULT_INPUT_TEMPLATE,
  DEFAULT_MODELS,
  DEFAULT_SYSTEM_TEMPLATE,
  GEMINI_SUMMARIZE_MODEL,
  DEEPSEEK_SUMMARIZE_MODEL,
  KnowledgeCutOffDate,
  ServiceProvider,
  StoreKey,
  SUMMARIZE_MODEL,
} from "../constant";
import Locale, { getLang } from "../locales";
import { prettyObject } from "../utils/format";
import { createPersistStore } from "../utils/store";
import { estimateTokenLength } from "../utils/token";
import { ModelConfig, ModelType, useAppConfig } from "./config";
import { useAccessStore } from "./access";
import { collectModelsWithDefaultModel } from "../utils/model";
import { createEmptyMask, Mask } from "./mask";
import { usePluginStore } from "./plugin";

import { processDataStream } from "ai";

const localStorage = safeLocalStorage();

function getProviderName(providerName?: string): string {
  const p = (providerName || "").toLowerCase();
  if (p.includes("google") || p.includes("gemini")) return "google";
  if (p.includes("anthropic") || p.includes("claude")) return "anthropic";
  if (p === "openai") return "openai";
  return providerName || "custom";
}

export type ChatMessageTool = {
  id: string;
  index?: number;
  type?: string;
  function?: {
    name: string;
    arguments?: string;
  };
  content?: string;
  isError?: boolean;
  errorMsg?: string;
};

export type ChatMessage = RequestMessage & {
  date: string;
  streaming?: boolean;
  isError?: boolean;
  id: string;
  model?: ModelType;
  tools?: ChatMessageTool[];
  audio_url?: string;
  reasoning?: string;
  reasoningDuration?: number;
};

export function createMessage(override: Partial<ChatMessage>): ChatMessage {
  return {
    id: nanoid(),
    date: new Date().toLocaleString(),
    role: "user",
    content: "",
    ...override,
  };
}

export interface ChatStat {
  tokenCount: number;
  wordCount: number;
  charCount: number;
}

export interface ChatSession {
  id: string;
  topic: string;

  memoryPrompt: string;
  messages: ChatMessage[];
  stat: ChatStat;
  lastUpdate: number;
  lastSummarizeIndex: number;
  clearContextIndex?: number;

  mask: Mask;
}

export const DEFAULT_TOPIC = Locale.Store.DefaultTopic;
export const BOT_HELLO: ChatMessage = createMessage({
  role: "assistant",
  content: Locale.Store.BotHello,
});

function createEmptySession(): ChatSession {
  return {
    id: nanoid(),
    topic: DEFAULT_TOPIC,
    memoryPrompt: "",
    messages: [],
    stat: {
      tokenCount: 0,
      wordCount: 0,
      charCount: 0,
    },
    lastUpdate: Date.now(),
    lastSummarizeIndex: 0,

    mask: createEmptyMask(),
  };
}

function getSummarizeModel(
  currentModel: string,
  providerName: string,
): string[] {
  // if it is using gpt-* models, force to use 4o-mini to summarize
  if (currentModel.startsWith("gpt") || currentModel.startsWith("chatgpt")) {
    const configStore = useAppConfig.getState();
    const accessStore = useAccessStore.getState();
    const allModel = collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );
    const summarizeModel = allModel.find(
      (m) => m.name === SUMMARIZE_MODEL && m.available,
    );
    if (summarizeModel) {
      return [
        summarizeModel.name,
        summarizeModel.provider?.providerName as string,
      ];
    }
  }
  if (currentModel.startsWith("gemini")) {
    return [GEMINI_SUMMARIZE_MODEL, ServiceProvider.Google];
  } else if (currentModel.startsWith("deepseek-")) {
    return [DEEPSEEK_SUMMARIZE_MODEL, ServiceProvider.DeepSeek];
  }

  return [currentModel, providerName];
}

function countMessages(msgs: ChatMessage[]) {
  return msgs.reduce(
    (pre, cur) => pre + estimateTokenLength(getMessageTextContent(cur)),
    0,
  );
}

function fillTemplateWith(input: string, modelConfig: ModelConfig) {
  const cutoff =
    KnowledgeCutOffDate[modelConfig.model] ?? KnowledgeCutOffDate.default;
  // Find the model in the DEFAULT_MODELS array that matches the modelConfig.model
  const modelInfo = DEFAULT_MODELS.find((m) => m.name === modelConfig.model);

  var serviceProvider = "OpenAI";
  if (modelInfo) {
    // TODO: auto detect the providerName from the modelConfig.model

    // Directly use the providerName from the modelInfo
    serviceProvider = modelInfo.provider.providerName;
  }

  const vars = {
    ServiceProvider: serviceProvider,
    cutoff,
    model: modelConfig.model,
    time: new Date().toString(),
    lang: getLang(),
    input: input,
  };

  let output = modelConfig.template ?? DEFAULT_INPUT_TEMPLATE;

  // remove duplicate
  if (input.startsWith(output)) {
    output = "";
  }

  // must contains {{input}}
  const inputVar = "{{input}}";
  if (!output.includes(inputVar)) {
    output += "\n" + inputVar;
  }

  Object.entries(vars).forEach(([name, value]) => {
    const regex = new RegExp(`{{${name}}}`, "g");
    output = output.replace(regex, value.toString()); // Ensure value is a string
  });

  return output;
}

const DEFAULT_CHAT_STATE = {
  sessions: [createEmptySession()],
  currentSessionIndex: 0,
  lastInput: "",
};

export const useChatStore = createPersistStore(
  DEFAULT_CHAT_STATE,
  (set, _get) => {
    function get() {
      return {
        ..._get(),
        ...methods,
      };
    }

    const methods = {
      forkSession() {
        // 获取当前会话
        const currentSession = get().currentSession();
        if (!currentSession) return;

        const newSession = createEmptySession();

        newSession.topic = currentSession.topic;
        // 深拷贝消息
        newSession.messages = currentSession.messages.map((msg) => ({
          ...msg,
          id: nanoid(), // 生成新的消息 ID
        }));
        newSession.mask = {
          ...currentSession.mask,
          modelConfig: {
            ...currentSession.mask.modelConfig,
          },
        };

        set((state) => ({
          currentSessionIndex: 0,
          sessions: [newSession, ...state.sessions],
        }));
      },

      clearSessions() {
        set(() => ({
          sessions: [createEmptySession()],
          currentSessionIndex: 0,
        }));
      },

      selectSession(index: number) {
        set({
          currentSessionIndex: index,
        });
      },

      moveSession(from: number, to: number) {
        set((state) => {
          const { sessions, currentSessionIndex: oldIndex } = state;

          // move the session
          const newSessions = [...sessions];
          const session = newSessions[from];
          newSessions.splice(from, 1);
          newSessions.splice(to, 0, session);

          // modify current session id
          let newIndex = oldIndex === from ? to : oldIndex;
          if (oldIndex > from && oldIndex <= to) {
            newIndex -= 1;
          } else if (oldIndex < from && oldIndex >= to) {
            newIndex += 1;
          }

          return {
            currentSessionIndex: newIndex,
            sessions: newSessions,
          };
        });
      },

      newSession(mask?: Mask) {
        const session = createEmptySession();

        if (mask) {
          const config = useAppConfig.getState();
          const globalModelConfig = config.modelConfig;

          session.mask = {
            ...mask,
            modelConfig: {
              ...globalModelConfig,
              ...mask.modelConfig,
            },
          };
          session.topic = mask.name;
        }

        set((state) => ({
          currentSessionIndex: 0,
          sessions: [session].concat(state.sessions),
        }));
      },

      nextSession(delta: number) {
        const n = get().sessions.length;
        const limit = (x: number) => (x + n) % n;
        const i = get().currentSessionIndex;
        get().selectSession(limit(i + delta));
      },

      deleteSession(index: number) {
        const deletingLastSession = get().sessions.length === 1;
        const deletedSession = get().sessions.at(index);

        if (!deletedSession) return;

        const sessions = get().sessions.slice();
        sessions.splice(index, 1);

        const currentIndex = get().currentSessionIndex;
        let nextIndex = Math.min(
          currentIndex - Number(index < currentIndex),
          sessions.length - 1,
        );

        if (deletingLastSession) {
          nextIndex = 0;
          sessions.push(createEmptySession());
        }

        // for undo delete action
        const restoreState = {
          currentSessionIndex: get().currentSessionIndex,
          sessions: get().sessions.slice(),
        };

        set(() => ({
          currentSessionIndex: nextIndex,
          sessions,
        }));

        showToast(
          Locale.Home.DeleteToast,
          {
            text: Locale.Home.Revert,
            onClick() {
              set(() => restoreState);
            },
          },
          5000,
        );
      },

      currentSession() {
        let index = get().currentSessionIndex;
        const sessions = get().sessions;

        if (index < 0 || index >= sessions.length) {
          index = Math.min(sessions.length - 1, Math.max(0, index));
          set(() => ({ currentSessionIndex: index }));
        }

        const session = sessions[index];

        return session;
      },

      onNewMessage(message: ChatMessage, targetSession: ChatSession) {
        get().updateTargetSession(targetSession, (session) => {
          session.messages = session.messages.concat();
          session.lastUpdate = Date.now();
        });

        get().updateStat(message, targetSession);

        get().summarizeSession(false, targetSession);
      },

      async onUserInput(content: string, attachImages?: string[]) {
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;

        let mContent: string | MultimodalContent[] = fillTemplateWith(
          content,
          modelConfig,
        );

        if (attachImages && attachImages.length > 0) {
          mContent = [
            ...(content ? [{ type: "text" as const, text: content }] : []),
            ...attachImages.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ];
        }

        let userMessage: ChatMessage = createMessage({
          role: "user",
          content: mContent,
        });

        const botMessage: ChatMessage = createMessage({
          role: "assistant",
          streaming: true,
          model: modelConfig.model,
        });

        // get recent messages
        const recentMessages = await get().getMessagesWithMemory();
        const sendMessages = recentMessages.concat(userMessage);
        const messageIndex = session.messages.length + 1;

        // save user's and bot's message
        get().updateTargetSession(session, (session) => {
          const savedUserMessage = {
            ...userMessage,
            content: mContent,
          };
          session.messages = session.messages.concat([
            savedUserMessage,
            botMessage,
          ]);
        });

        const mappedMessages = sendMessages.map((m) => {
          if (typeof m.content === "string") {
            return { role: m.role, content: m.content };
          }
          if (Array.isArray(m.content)) {
            return {
              role: m.role,
              content: m.content.map((part: any) => {
                if (typeof part === "string")
                  return { type: "text" as const, text: part };
                if (part.type === "text")
                  return { type: "text" as const, text: part.text || "" };
                if (part.type === "image" || part.type === "image_url") {
                  return {
                    type: "image" as const,
                    image: part.image || part.image_url?.url || "",
                  };
                }
                return { type: "text" as const, text: JSON.stringify(part) };
              }),
            };
          }
          return { role: m.role, content: String(m.content) };
        });

        const accessStore = useAccessStore.getState();
        const customApiKey = accessStore.getApiKeyByProvider(
          modelConfig.providerName,
        );
        const customBaseUrl = accessStore.getBaseUrlByProvider(
          modelConfig.providerName,
        );
        const customConfig =
          accessStore.useCustomConfig || customApiKey || customBaseUrl
            ? {
                apiKey: customApiKey || undefined,
                baseUrl: customBaseUrl || undefined,
              }
            : undefined;

        const pluginStore = usePluginStore.getState();
        const activePlugins = (session.mask.plugin || [])
          .map((id) => pluginStore.get(id))
          .filter(Boolean);

        const payload: any = {
          messages: mappedMessages,
          model: modelConfig.model,
          provider: getProviderName(modelConfig.providerName),
          modelConfig: {
            temperature: modelConfig.temperature,
            top_p: modelConfig.top_p,
            max_tokens: modelConfig.max_tokens,
            reasoningConfig: {
              thinkingLevel: modelConfig.thinkingLevel,
              thinkingBudget: modelConfig.thinkingBudget,
            },
          },
          customConfig,
          pluginIds: session.mask.plugin,
          plugins: activePlugins,
        };

        const controller = new AbortController();
        ChatControllerPool.addController(
          session.id,
          botMessage.id ?? messageIndex,
          controller,
        );

        (async () => {
          try {
            const res = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });

            if (!res.ok || !res.body) {
              const errorText = await res.text();
              let errorMsg = errorText;
              try {
                const errorJson = JSON.parse(errorText);
                errorMsg = errorJson.message || errorJson.error || errorText;
              } catch {}
              throw new Error(errorMsg || `HTTP ${res.status}`);
            }

            let reasoningStartTime: number | undefined = undefined;

            await processDataStream({
              stream: res.body,
              onTextPart: (textDelta) => {
                botMessage.streaming = true;
                botMessage.content += textDelta;
                if (
                  botMessage.reasoning &&
                  botMessage.reasoningDuration === undefined &&
                  reasoningStartTime !== undefined
                ) {
                  botMessage.reasoningDuration =
                    Date.now() - reasoningStartTime;
                }
                get().updateTargetSession(session, (s) => {
                  s.messages = s.messages.concat();
                });
              },
              onReasoningPart: (reasoningDelta) => {
                botMessage.streaming = true;
                if (reasoningStartTime === undefined) {
                  reasoningStartTime = Date.now();
                }
                botMessage.reasoning =
                  (botMessage.reasoning || "") + reasoningDelta;
                get().updateTargetSession(session, (s) => {
                  s.messages = s.messages.concat();
                });
              },
              onToolCallPart: (toolCall) => {
                botMessage.streaming = true;
                botMessage.tools = botMessage.tools || [];
                botMessage.tools.push({
                  id: toolCall.toolCallId,
                  function: {
                    name: toolCall.toolName,
                    arguments:
                      typeof toolCall.args === "string"
                        ? toolCall.args
                        : JSON.stringify(toolCall.args),
                  },
                });
                get().updateTargetSession(session, (s) => {
                  s.messages = s.messages.concat();
                });
              },
              onToolResultPart: (toolResult) => {
                botMessage.tools = botMessage.tools || [];
                const tool = botMessage.tools.find(
                  (t) => t.id === toolResult.toolCallId,
                );
                const resultStr =
                  typeof toolResult.result === "string"
                    ? toolResult.result
                    : JSON.stringify(toolResult.result);
                if (tool) {
                  tool.content = resultStr;
                  tool.isError = false;
                } else {
                  botMessage.tools.push({
                    id: toolResult.toolCallId,
                    content: resultStr,
                    isError: false,
                  });
                }
                get().updateTargetSession(session, (s) => {
                  s.messages = s.messages.concat();
                });
              },
              onErrorPart: (errorMsg) => {
                botMessage.isError = true;
                botMessage.content += `\n\n[Error]: ${errorMsg}`;
                get().updateTargetSession(session, (s) => {
                  s.messages = s.messages.concat();
                });
              },
              onFinishMessagePart: () => {
                botMessage.streaming = false;
                if (
                  botMessage.reasoning &&
                  botMessage.reasoningDuration === undefined &&
                  reasoningStartTime !== undefined
                ) {
                  botMessage.reasoningDuration =
                    Date.now() - reasoningStartTime;
                }
                botMessage.date = new Date().toLocaleString();
                get().onNewMessage(botMessage, session);
                ChatControllerPool.remove(
                  session.id,
                  botMessage.id ?? messageIndex,
                );
              },
            });
          } catch (err: any) {
            const isAborted =
              err.name === "AbortError" ||
              controller.signal.aborted ||
              err.message?.includes?.("aborted");
            botMessage.streaming = false;
            if (!isAborted) {
              botMessage.isError = true;
              userMessage.isError = true;
              botMessage.content +=
                "\n\n" +
                prettyObject({
                  error: true,
                  message: err.message || String(err),
                });
            }
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
            ChatControllerPool.remove(
              session.id,
              botMessage.id ?? messageIndex,
            );

            console.error("[Chat] failed ", err);
          }
        })();
      },

      getMemoryPrompt() {
        const session = get().currentSession();

        if (session.memoryPrompt.length) {
          return {
            role: "system",
            content: Locale.Store.Prompt.History(session.memoryPrompt),
            date: "",
          } as ChatMessage;
        }
      },

      async getMessagesWithMemory() {
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;
        const clearContextIndex = session.clearContextIndex ?? 0;
        const messages = session.messages.slice();
        const totalMessageCount = session.messages.length;

        // in-context prompts
        const contextPrompts = session.mask.context.slice();

        // system prompts, to get close to OpenAI Web ChatGPT
        const shouldInjectSystemPrompts =
          modelConfig.enableInjectSystemPrompts &&
          (session.mask.modelConfig.model.startsWith("gpt-") ||
            session.mask.modelConfig.model.startsWith("chatgpt-"));

        let systemPrompts: ChatMessage[] = [];

        if (shouldInjectSystemPrompts) {
          systemPrompts = [
            createMessage({
              role: "system",
              content: fillTemplateWith("", {
                ...modelConfig,
                template: DEFAULT_SYSTEM_TEMPLATE,
              }),
            }),
          ];
        }

        if (shouldInjectSystemPrompts) {
          console.log(
            "[Global System Prompt] ",
            systemPrompts.at(0)?.content ?? "empty",
          );
        }
        const memoryPrompt = get().getMemoryPrompt();
        // long term memory
        const shouldSendLongTermMemory =
          modelConfig.sendMemory &&
          session.memoryPrompt &&
          session.memoryPrompt.length > 0 &&
          session.lastSummarizeIndex > clearContextIndex;
        const longTermMemoryPrompts =
          shouldSendLongTermMemory && memoryPrompt ? [memoryPrompt] : [];
        const longTermMemoryStartIndex = session.lastSummarizeIndex;

        // short term memory
        const shortTermMemoryStartIndex = Math.max(
          0,
          totalMessageCount - modelConfig.historyMessageCount,
        );

        // lets concat send messages, including 4 parts:
        // 0. system prompt: to get close to OpenAI Web ChatGPT
        // 1. long term memory: summarized memory messages
        // 2. pre-defined in-context prompts
        // 3. short term memory: latest n messages
        // 4. newest input message
        const memoryStartIndex = shouldSendLongTermMemory
          ? Math.min(longTermMemoryStartIndex, shortTermMemoryStartIndex)
          : shortTermMemoryStartIndex;
        // and if user has cleared history messages, we should exclude the memory too.
        const contextStartIndex = Math.max(clearContextIndex, memoryStartIndex);
        const maxTokenThreshold = modelConfig.max_tokens;

        // get recent messages as much as possible
        const reversedRecentMessages = [];
        for (
          let i = totalMessageCount - 1, tokenCount = 0;
          i >= contextStartIndex && tokenCount < maxTokenThreshold;
          i -= 1
        ) {
          const msg = messages[i];
          if (!msg || msg.isError) continue;
          tokenCount += estimateTokenLength(getMessageTextContent(msg));
          reversedRecentMessages.push(msg);
        }
        // concat all messages
        const recentMessages = [
          ...systemPrompts,
          ...longTermMemoryPrompts,
          ...contextPrompts,
          ...reversedRecentMessages.reverse(),
        ];

        return recentMessages;
      },

      updateMessage(
        sessionIndex: number,
        messageIndex: number,
        updater: (message?: ChatMessage) => void,
      ) {
        const sessions = get().sessions;
        const session = sessions.at(sessionIndex);
        const messages = session?.messages;
        updater(messages?.at(messageIndex));
        set(() => ({ sessions }));
      },

      resetSession(session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.messages = [];
          session.memoryPrompt = "";
        });
      },

      summarizeSession(
        refreshTitle: boolean = false,
        targetSession: ChatSession,
      ) {
        const config = useAppConfig.getState();
        const session = targetSession;
        const modelConfig = session.mask.modelConfig;

        // if not config compressModel, then using getSummarizeModel
        const [model, providerName] = modelConfig.compressModel
          ? [modelConfig.compressModel, modelConfig.compressProviderName]
          : getSummarizeModel(
              session.mask.modelConfig.model,
              session.mask.modelConfig.providerName,
            );
        const accessStore = useAccessStore.getState();
        const customApiKey = accessStore.getApiKeyByProvider(providerName);
        const customBaseUrl = accessStore.getBaseUrlByProvider(providerName);
        const customConfig =
          accessStore.useCustomConfig || customApiKey || customBaseUrl
            ? {
                apiKey: customApiKey || undefined,
                baseUrl: customBaseUrl || undefined,
              }
            : undefined;

        // remove error messages if any
        const messages = session.messages;

        // should summarize topic after chating more than 50 words
        const SUMMARIZE_MIN_LEN = 50;
        if (
          (config.enableAutoGenerateTitle &&
            session.topic === DEFAULT_TOPIC &&
            countMessages(messages) >= SUMMARIZE_MIN_LEN) ||
          refreshTitle
        ) {
          const startIndex = Math.max(
            0,
            messages.length - modelConfig.historyMessageCount,
          );
          const topicMessages = messages
            .slice(
              startIndex < messages.length ? startIndex : messages.length - 1,
              messages.length,
            )
            .concat(
              createMessage({
                role: "user",
                content: Locale.Store.Prompt.Topic,
              }),
            );

          const topicPayload: any = {
            messages: topicMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            model,
            provider: getProviderName(providerName),
            customConfig,
          };

          fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(topicPayload),
          })
            .then(async (res) => {
              if (res.ok && res.body) {
                let topicContent = "";
                await processDataStream({
                  stream: res.body,
                  onTextPart: (delta) => {
                    topicContent += delta;
                  },
                  onFinishMessagePart: () => {
                    if (topicContent.length > 0) {
                      get().updateTargetSession(session, (session) => {
                        session.topic = trimTopic(topicContent);
                      });
                    }
                  },
                });
              }
            })
            .catch((err) => console.error("[Summarize topic error]", err));
        }

        const summarizeIndex = Math.max(
          session.lastSummarizeIndex,
          session.clearContextIndex ?? 0,
        );
        let toBeSummarizedMsgs = messages
          .filter((msg) => !msg.isError)
          .slice(summarizeIndex);

        const historyMsgLength = countMessages(toBeSummarizedMsgs);

        if (historyMsgLength > (modelConfig?.max_tokens || 4000)) {
          const n = toBeSummarizedMsgs.length;
          toBeSummarizedMsgs = toBeSummarizedMsgs.slice(
            Math.max(0, n - modelConfig.historyMessageCount),
          );
        }
        const memoryPrompt = get().getMemoryPrompt();
        if (memoryPrompt) {
          // add memory prompt
          toBeSummarizedMsgs.unshift(memoryPrompt);
        }

        const lastSummarizeIndex = session.messages.length;

        console.log(
          "[Chat History] ",
          toBeSummarizedMsgs,
          historyMsgLength,
          modelConfig.compressMessageLengthThreshold,
        );

        if (
          historyMsgLength > modelConfig.compressMessageLengthThreshold &&
          modelConfig.sendMemory
        ) {
          const { max_tokens, ...modelcfg } = modelConfig;
          const memoryMessages = toBeSummarizedMsgs.concat(
            createMessage({
              role: "system",
              content: Locale.Store.Prompt.Summarize,
              date: "",
            }),
          );

          const memoryPayload: any = {
            messages: memoryMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            model,
            provider: getProviderName(providerName),
            modelConfig: modelcfg,
            customConfig,
          };

          fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(memoryPayload),
          })
            .then(async (res) => {
              if (res.ok && res.body) {
                let memoryContent = "";
                await processDataStream({
                  stream: res.body,
                  onTextPart: (delta) => {
                    memoryContent += delta;
                    session.memoryPrompt = memoryContent;
                  },
                  onFinishMessagePart: () => {
                    get().updateTargetSession(session, (session) => {
                      session.lastSummarizeIndex = lastSummarizeIndex;
                      session.memoryPrompt = memoryContent;
                    });
                  },
                });
              }
            })
            .catch((err) => console.error("[Summarize memory error]", err));
        }
      },

      updateStat(message: ChatMessage, session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.stat.charCount += message.content.length;
          // TODO: should update chat count and word count
        });
      },
      updateTargetSession(
        targetSession: ChatSession,
        updater: (session: ChatSession) => void,
      ) {
        const sessions = get().sessions;
        const index = sessions.findIndex((s) => s.id === targetSession.id);
        if (index < 0) return;
        updater(sessions[index]);
        set(() => ({ sessions }));
      },
      async clearAllData() {
        await indexedDBStorage.clear();
        localStorage.clear();
        location.reload();
      },
      setLastInput(lastInput: string) {
        set({
          lastInput,
        });
      },
    };

    return methods;
  },
  {
    name: StoreKey.Chat,
    version: 3.3,
    migrate(persistedState, version) {
      const state = persistedState as any;
      const newState = JSON.parse(
        JSON.stringify(state),
      ) as typeof DEFAULT_CHAT_STATE;

      if (version < 2) {
        newState.sessions = [];

        const oldSessions = state.sessions;
        for (const oldSession of oldSessions) {
          const newSession = createEmptySession();
          newSession.topic = oldSession.topic;
          newSession.messages = [...oldSession.messages];
          newSession.mask.modelConfig.sendMemory = true;
          newSession.mask.modelConfig.historyMessageCount = 4;
          newSession.mask.modelConfig.compressMessageLengthThreshold = 1000;
          newState.sessions.push(newSession);
        }
      }

      if (version < 3) {
        // migrate id to nanoid
        newState.sessions.forEach((s) => {
          s.id = nanoid();
          s.messages.forEach((m) => (m.id = nanoid()));
        });
      }

      // Enable `enableInjectSystemPrompts` attribute for old sessions.
      // Resolve issue of old sessions not automatically enabling.
      if (version < 3.1) {
        newState.sessions.forEach((s) => {
          if (
            // Exclude those already set by user
            !s.mask.modelConfig.hasOwnProperty("enableInjectSystemPrompts")
          ) {
            // Because users may have changed this configuration,
            // the user's current configuration is used instead of the default
            const config = useAppConfig.getState();
            s.mask.modelConfig.enableInjectSystemPrompts =
              config.modelConfig.enableInjectSystemPrompts;
          }
        });
      }

      // add default summarize model for every session
      if (version < 3.2) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = config.modelConfig.compressModel;
          s.mask.modelConfig.compressProviderName =
            config.modelConfig.compressProviderName;
        });
      }
      // revert default summarize model for every session
      if (version < 3.3) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = "";
          s.mask.modelConfig.compressProviderName = "";
        });
      }

      return newState as any;
    },
  },
);

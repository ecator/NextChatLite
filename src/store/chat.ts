import { getClientConfig } from "../config/client";
import {
  getMessageTextContent,
  indexedDBStorage,
  safeLocalStorage,
  trimTopic,
} from "../utils";
import { nanoid } from "nanoid";
import type { MultimodalContent, RequestMessage } from "../client/api";
import { ChatControllerPool } from "../client/controller";
import { showToast } from "../components/ui-lib";
import {
  ApiPath,
  CACHE_URL_PREFIX,
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
import { cacheImageToBase64Image } from "@/utils/chat";
import Locale, { getLang } from "../locales";
import { prettyObject } from "../utils/format";
import { createPersistStore } from "../utils/store";
import { estimateTokenLength } from "../utils/token";
import { DEFAULT_CONFIG, ModelConfig, ModelType, useAppConfig } from "./config";
import { createEmptyMask, Mask } from "./mask";
import { usePluginStore } from "./plugin";
import {
  isModelInModelsJson,
  useModelStore,
  validateModelOrFallback,
} from "./models";

import { processDataStream } from "@/utils/chat-stream";

const localStorage = safeLocalStorage();

function getProviderName(providerName?: string): string {
  const p = (providerName || "").toLowerCase();
  if (p.includes("google") || p.includes("gemini")) return "google";
  if (p.includes("anthropic") || p.includes("claude")) return "anthropic";
  if (p === "openai") return "openai";
  return providerName || "custom";
}
function getCustomConfig(providerName?: string) {
  return undefined;
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
  const emptyMask = createEmptyMask();
  const validated = validateModelOrFallback(
    emptyMask.modelConfig.model,
    emptyMask.modelConfig.providerName,
  );
  emptyMask.modelConfig.model = validated.model as ModelType;
  emptyMask.modelConfig.providerName =
    validated.providerName as ServiceProvider;

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

    mask: emptyMask,
  };
}

function getSummarizeModel(
  currentModel: string,
  providerName: string,
): [string, string] {
  const modelStore = useModelStore.getState();
  const lower = (currentModel || "").toLowerCase();

  if (lower.includes("google") || lower.includes("gemini")) {
    if (modelStore.getModel(GEMINI_SUMMARIZE_MODEL)) {
      return [GEMINI_SUMMARIZE_MODEL, ServiceProvider.Google];
    }
  } else if (
    lower.includes("openai") ||
    lower.startsWith("gpt") ||
    lower.startsWith("chatgpt")
  ) {
    if (modelStore.getModel(SUMMARIZE_MODEL)) {
      return [SUMMARIZE_MODEL, ServiceProvider.OpenAI];
    }
  } else if (lower.includes("deepseek")) {
    if (modelStore.getModel(DEEPSEEK_SUMMARIZE_MODEL)) {
      return [DEEPSEEK_SUMMARIZE_MODEL, ServiceProvider.DeepSeek];
    }
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

  let serviceProvider = "OpenAI";
  if (modelInfo) {
    serviceProvider = modelInfo.provider.providerName;
  } else {
    const modelMeta = useModelStore.getState().getModel(modelConfig.model);
    const rawProvider = modelMeta?.provider || modelConfig.providerName || "";
    const providerMap: Record<string, string> = {
      openai: "OpenAI",
      anthropic: "Anthropic",
      google: "Google",
      deepseek: "DeepSeek",
      xai: "xAI",
      meta: "Meta",
      mistral: "Mistral",
      alibaba: "Alibaba",
      bytedance: "ByteDance",
      tencent: "Tencent",
      baidu: "Baidu",
    };
    if (rawProvider) {
      serviceProvider =
        providerMap[rawProvider.toLowerCase()] ||
        rawProvider.charAt(0).toUpperCase() + rawProvider.slice(1);
    }
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

  return output.trim();
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

        const validated = validateModelOrFallback(
          session.mask.modelConfig.model,
          session.mask.modelConfig.providerName,
        );
        session.mask.modelConfig.model = validated.model as ModelType;
        session.mask.modelConfig.providerName =
          validated.providerName as ServiceProvider;

        set((state) => ({
          currentSessionIndex: 0,
          sessions: [session].concat(state.sessions),
        }));
        get().markUpdate();
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

        if (session && !isModelInModelsJson(session.mask.modelConfig.model)) {
          const validated = validateModelOrFallback(
            session.mask.modelConfig.model,
            session.mask.modelConfig.providerName,
          );
          session.mask.modelConfig.model = validated.model as ModelType;
          session.mask.modelConfig.providerName =
            validated.providerName as ServiceProvider;
        }

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

        const mappedMessages = await Promise.all(
          sendMessages.map(async (m) => {
            if (typeof m.content === "string") {
              return { role: m.role, content: m.content };
            }
            if (Array.isArray(m.content)) {
              const parts = await Promise.all(
                m.content.map(async (part: any) => {
                  if (typeof part === "string")
                    return { type: "text" as const, text: part };
                  if (part.type === "text")
                    return { type: "text" as const, text: part.text || "" };
                  if (part.type === "image" || part.type === "image_url") {
                    let img = part.image || part.image_url?.url || "";
                    if (
                      img &&
                      typeof window !== "undefined" &&
                      img.includes(CACHE_URL_PREFIX)
                    ) {
                      try {
                        img = await cacheImageToBase64Image(img);
                      } catch (err) {
                        console.error(
                          "[chat] cacheImageToBase64Image error:",
                          err,
                        );
                      }
                    }
                    return {
                      type: "image" as const,
                      image: img,
                    };
                  }
                  return { type: "text" as const, text: JSON.stringify(part) };
                }),
              );
              return { role: m.role, content: parts };
            }
            return { role: m.role, content: String(m.content) };
          }),
        );

        const pluginStore = usePluginStore.getState();
        const activePlugins = (session.mask.plugin || [])
          .map((id) => pluginStore.get(id))
          .filter(Boolean);

        const modelMeta = useModelStore.getState().getModel(modelConfig.model);

        const payload: any = {
          messages: mappedMessages,
          model: modelConfig.model,
          provider:
            modelMeta?.provider || getProviderName(modelConfig.providerName),
          env: modelMeta?.env,
          npm: modelMeta?.npm,
          api: modelMeta?.api,
          modelInfo: modelMeta
            ? {
                id: modelMeta.id,
                name: modelMeta.name,
                provider: modelMeta.provider,
                family: modelMeta.family,
                description: modelMeta.description,
                tool_call: modelMeta.tool_call,
                modalities: modelMeta.modalities,
                limit: {
                  context: modelMeta.contextLimit,
                  output: modelMeta.outputLimit,
                },
                reasoning: modelMeta.hasReasoning,
                reasoning_options: modelMeta.reasoning_options,
              }
            : undefined,
          modelConfig: {
            temperature: modelConfig.temperature,
            top_p: modelConfig.top_p,
            max_tokens: modelConfig.max_tokens,
            reasoningConfig: {
              thinkingLevel: modelConfig.thinkingLevel,
              thinkingBudget: modelConfig.thinkingBudget,
              includeThinking: modelConfig.includeThinking ?? true,
            },
          },
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
          let reasoningStartTime: number | undefined = undefined;
          let accumulatedReasoningDuration = 0;
          try {
            const res = await fetch(ApiPath.Chat, {
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

            await processDataStream({
              stream: res.body,
              onTextPart: (textDelta) => {
                botMessage.streaming = true;
                botMessage.content += textDelta;
                if (botMessage.reasoning && reasoningStartTime !== undefined) {
                  accumulatedReasoningDuration +=
                    Date.now() - reasoningStartTime;
                  botMessage.reasoningDuration = accumulatedReasoningDuration;
                  reasoningStartTime = undefined;
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
                if (botMessage.reasoning && reasoningStartTime !== undefined) {
                  accumulatedReasoningDuration +=
                    Date.now() - reasoningStartTime;
                  botMessage.reasoningDuration = accumulatedReasoningDuration;
                  reasoningStartTime = undefined;
                }
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
                botMessage.streaming = false;
                botMessage.isError = true;
                userMessage.isError = true;
                const errText = `[Error]: ${errorMsg}`;
                botMessage.content = botMessage.content
                  ? `${botMessage.content}\n\n${errText}`
                  : errText;
                if (botMessage.reasoning && reasoningStartTime !== undefined) {
                  accumulatedReasoningDuration +=
                    Date.now() - reasoningStartTime;
                  botMessage.reasoningDuration = accumulatedReasoningDuration;
                  reasoningStartTime = undefined;
                }
                botMessage.date = new Date().toLocaleString();
                ChatControllerPool.remove(
                  session.id,
                  botMessage.id ?? messageIndex,
                );
                get().updateTargetSession(session, (s) => {
                  s.messages = s.messages.concat();
                });
              },
              onFinishMessagePart: () => {
                botMessage.streaming = false;
                if (botMessage.reasoning && reasoningStartTime !== undefined) {
                  accumulatedReasoningDuration +=
                    Date.now() - reasoningStartTime;
                  botMessage.reasoningDuration = accumulatedReasoningDuration;
                  reasoningStartTime = undefined;
                }
                botMessage.date = new Date().toLocaleString();
                ChatControllerPool.remove(
                  session.id,
                  botMessage.id ?? messageIndex,
                );
                get().onNewMessage(botMessage, session);
              },
            });

            if (botMessage.streaming) {
              botMessage.streaming = false;
              if (botMessage.reasoning && reasoningStartTime !== undefined) {
                accumulatedReasoningDuration += Date.now() - reasoningStartTime;
                botMessage.reasoningDuration = accumulatedReasoningDuration;
                reasoningStartTime = undefined;
              }
              botMessage.date = botMessage.date || new Date().toLocaleString();
              ChatControllerPool.remove(
                session.id,
                botMessage.id ?? messageIndex,
              );
              get().onNewMessage(botMessage, session);
            }
          } catch (err: any) {
            const isAborted =
              err.name === "AbortError" ||
              controller.signal.aborted ||
              err.message?.includes?.("aborted");
            botMessage.streaming = false;
            if (!isAborted) {
              botMessage.isError = true;
              userMessage.isError = true;
              const errText = prettyObject({
                error: true,
                message: err.message || String(err),
              });
              botMessage.content = botMessage.content
                ? `${botMessage.content}\n\n${errText}`
                : errText;
            }
            if (botMessage.reasoning && reasoningStartTime !== undefined) {
              accumulatedReasoningDuration += Date.now() - reasoningStartTime;
              botMessage.reasoningDuration = accumulatedReasoningDuration;
              reasoningStartTime = undefined;
            }
            botMessage.date = botMessage.date || new Date().toLocaleString();
            ChatControllerPool.remove(
              session.id,
              botMessage.id ?? messageIndex,
            );
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });

            console.error("[Chat] failed ", err);
          } finally {
            ChatControllerPool.remove(
              session.id,
              botMessage.id ?? messageIndex,
            );
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

        // system prompts
        const shouldInjectSystemPrompts = Boolean(
          modelConfig.enableInjectSystemPrompts,
        );

        let systemPrompts: ChatMessage[] = [];

        if (shouldInjectSystemPrompts) {
          const systemTemplate =
            getClientConfig()?.defaultSystemTemplate ?? DEFAULT_SYSTEM_TEMPLATE;
          systemPrompts = [
            createMessage({
              role: "system",
              content: fillTemplateWith("", {
                ...modelConfig,
                template: systemTemplate,
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

        // Fallback chain for compress/summarize model:
        // 1. Session-level compressModel override (if valid in catalog)
        // 2. Global-level config compressModel (if valid in catalog)
        // 3. Dynamic provider fallback via getSummarizeModel
        const configuredModel =
          modelConfig.compressModel || config.modelConfig.compressModel;
        const configuredProvider =
          modelConfig.compressProviderName ||
          config.modelConfig.compressProviderName;

        const modelStore = useModelStore.getState();
        let model: string;
        let providerName: string;

        if (configuredModel && modelStore.getModel(configuredModel)) {
          model = configuredModel;
          providerName =
            configuredProvider || session.mask.modelConfig.providerName;
        } else {
          [model, providerName] = getSummarizeModel(
            session.mask.modelConfig.model,
            session.mask.modelConfig.providerName,
          );
        }

        // remove error messages if any
        const messages = session.messages.filter((msg) => !msg.isError);

        // should summarize topic after chatting more than 50 words or at least 2 messages (1 Q&A round)
        const SUMMARIZE_MIN_LEN = 50;
        const isDefaultTopic =
          session.topic === DEFAULT_TOPIC ||
          session.topic === "新的聊天" ||
          session.topic === "New Conversation" ||
          session.topic === "New Chat";

        if (
          (config.enableAutoGenerateTitle &&
            isDefaultTopic &&
            messages.length >= 2 &&
            (countMessages(messages) >= SUMMARIZE_MIN_LEN ||
              messages.length >= 2)) ||
          refreshTitle
        ) {
          if (messages.length > 0) {
            const startIndex = Math.max(
              0,
              messages.length - modelConfig.historyMessageCount,
            );
            const historySlice = messages.slice(
              startIndex < messages.length ? startIndex : messages.length - 1,
              messages.length,
            );

            const mappedTopicHistory = historySlice
              .map((m) => ({
                role: m.role,
                content: getMessageTextContent(m),
              }))
              .filter((m) => Boolean(m.content && m.content.trim().length > 0));

            if (mappedTopicHistory.length > 0) {
              const topicMessages = [
                ...mappedTopicHistory,
                {
                  role: "user" as const,
                  content: Locale.Store.Prompt.Topic,
                },
              ];

              const topicMeta = modelStore.getModel(model);
              const topicPayload: any = {
                messages: topicMessages,
                model,
                provider: topicMeta?.provider || getProviderName(providerName),
                env: topicMeta?.env,
                npm: topicMeta?.npm,
                api: topicMeta?.api,
                modelInfo: topicMeta,
                modelConfig: {
                  max_tokens: 50,
                  temperature: 0.3,
                  reasoningConfig: {
                    thinkingLevel: "minimal",
                  },
                },
              };

              return fetch(ApiPath.Chat, {
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
                  } else {
                    console.error(
                      "[Summarize topic error] HTTP status:",
                      res.status,
                    );
                  }
                })
                .catch((err) => console.error("[Summarize topic error]", err));
            }
          }
        }

        const summarizeIndex = Math.max(
          session.lastSummarizeIndex,
          session.clearContextIndex ?? 0,
        );
        let toBeSummarizedMsgs = messages
          .filter((msg) => !msg.isError)
          .slice(summarizeIndex);

        const historyMsgLength = countMessages(toBeSummarizedMsgs);

        const maxSummarizeLen = Math.max(
          (modelConfig?.max_tokens || 4000) * 2,
          modelConfig.compressMessageLengthThreshold * 2,
        );
        if (historyMsgLength > maxSummarizeLen) {
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
              role: "user",
              content: Locale.Store.Prompt.Summarize,
              date: "",
            }),
          );

          const memoryMeta = useModelStore.getState().getModel(model);
          const memoryPayload: any = {
            messages: memoryMessages.map((m) => ({
              role: m.role,
              content: getMessageTextContent(m),
            })),
            model,
            provider: memoryMeta?.provider || getProviderName(providerName),
            env: memoryMeta?.env,
            npm: memoryMeta?.npm,
            api: memoryMeta?.api,
            modelInfo: memoryMeta,
            modelConfig: modelcfg,
          };

          fetch(ApiPath.Chat, {
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
        const sessions = [...get().sessions];
        const index = sessions.findIndex((s) => s.id === targetSession.id);
        if (index < 0) return;
        const session = { ...sessions[index] };
        updater(session);
        sessions[index] = session;
        set(() => ({ sessions }));
        get().markUpdate();
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
    version: 3.5,
    migrate(persistedState: any, version: number) {
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
          newSession.mask.modelConfig.historyMessageCount = 20;
          newSession.mask.modelConfig.compressMessageLengthThreshold = 8000;
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

      if (version < 3.4) {
        newState.sessions.forEach((s) => {
          if (
            s.mask.modelConfig.model === "gpt-4o-mini" &&
            s.messages.length === 0
          ) {
            s.mask.modelConfig.model = DEFAULT_CONFIG.modelConfig.model;
            s.mask.modelConfig.providerName =
              DEFAULT_CONFIG.modelConfig.providerName;
          }
        });
      }

      if (version < 3.5) {
        newState.sessions.forEach((s) => {
          if (s.mask.syncGlobalConfig) {
            s.mask.modelConfig.sendMemory = false;
          }
        });
      }

      // Ensure all restored sessions only use valid models from /providers.json
      newState.sessions.forEach((s) => {
        if (!isModelInModelsJson(s.mask?.modelConfig?.model)) {
          const validated = validateModelOrFallback(
            s.mask?.modelConfig?.model,
            s.mask?.modelConfig?.providerName,
          );
          s.mask.modelConfig.model = validated.model as ModelType;
          s.mask.modelConfig.providerName =
            validated.providerName as ServiceProvider;
        }
      });

      return newState as any;
    },
  },
);

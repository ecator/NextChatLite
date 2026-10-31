# Project: NextChatLite Modernization & Refactor

## Architecture
NextChatLite is refactored into a high-performance, web-only, server-rendered Next.js 16 App Router chat application powered by Vercel AI SDK, dynamic models.dev metadata, and pnpm.

```
                    ┌────────────────────────────────────────────────────────┐
                    │                      Next.js 16 UI                     │
                    │   (App Router, React 19, Client & Server Components)   │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                 ┌──────────────────────────────┼─────────────────────────────┐
                 │                              │                             │
                 ▼                              ▼                             ▼
   ┌───────────────────────────┐  ┌───────────────────────────┐ ┌───────────────────────────┐
   │    useChatStore (Zustand) │  │  useModelStore (Zustand)  │ │ usePluginStore (Zustand)  │
   │  - Multi-turn sessions    │  │  - models.dev live API    │ │ - OpenAPI 3.x schema pars │
   │  - Memory summarization   │  │  - @opencode-ai/models    │ │ - Dynamic tool registry   │
   │  - ThinkingBlock states   │  │  - Capabilities & limits  │ │ - CORS /api/proxy adapter │
   └─────────────┬─────────────┘  └─────────────┬─────────────┘ └─────────────┬─────────────┘
                 │                              │                             │
                 └──────────────────────────────┼─────────────────────────────┘
                                                │
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │             Unified /api/chat/route.ts                 │
                    │               (Vercel AI SDK Core)                     │
                    ├────────────────────────────────────────────────────────┤
                    │ - Dynamic Provider Factory (OpenAI, Google, Anthropic) │
                    │ - User Custom BASE_URL & API Key overrides             │
                    │ - Gemini 3 ThinkingConfig & Reasoning extraction       │
                    │ - Multi-step OpenAPI Tool Calling (maxSteps)           │
                    │ - Standard DataStreamResponse streaming                │
                    └────────────────────────────────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | pnpm Package Manager Migration | Replace yarn with pnpm, generate pnpm-lock.yaml, update scripts & packageManager | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Next.js 16+ & React 19 Modernization | Upgrade to Next.js 16+, App Router route handlers with async params, Zustand v5 | M1 | ORIGINAL_REQUEST §R1 |
| F3 | Non-Web Platform Stripping | Delete src-tauri/, desktop CI workflows, stream.ts, Tauri window/drag hooks | M1 | ORIGINAL_REQUEST §R1 |
| F4 | Commercial / SaaS Cleanup | Remove SaaS constants, TopBanner, goSaas, saasStart, paywalls, referral links | M1 | ORIGINAL_REQUEST §R1 |
| F5 | Docs Unification & Root AGENTS.md | Remove multi-lang READMEs, retain English docs, create root AGENTS.md | M1 | ORIGINAL_REQUEST §R1 |
| F6 | UI i18n Localization Retention | Preserve all 20 runtime UI localization files in app/locales/ | M1 | ORIGINAL_REQUEST §R1 |
| F7 | Standalone Image Gen Pruning | Delete Stable Diffusion components/store/api and DALL-E chat special cases | M2 | ORIGINAL_REQUEST §R2 |
| F8 | Model Context Protocol (MCP) Removal | Delete app/mcp/, @modelcontextprotocol/sdk, MCP market UI, MCP prompts | M2 | ORIGINAL_REQUEST §R2 |
| F9 | Clean Chat Core & Session Store | Verify multi-turn sessions, message history, Mask system, and markdown rendering | M2 | ORIGINAL_REQUEST §R2 |
| F10 | models.dev Dynamic Metadata Integration | Fetch live metadata from models.dev / @opencode-ai/models with snapshot fallback | M3 | ORIGINAL_REQUEST §R4 |
| F11 | Metadata-Driven Model Selector & Validation | Adapt model picker, multimodal buttons, context/output limits from live metadata | M3 | ORIGINAL_REQUEST §R4 |
| F12 | Vercel AI SDK Core Migration | Replace custom platform classes with ai, @ai-sdk/openai, @ai-sdk/google | M4 | ORIGINAL_REQUEST §R3 |
| F13 | Custom BASE_URL & Key Overrides | Support user-configured custom BASE_URL, custom API keys, and endpoint overrides | M4 | ORIGINAL_REQUEST §R3 |
| F14 | OpenAPI Plugin Tool Calling in AI SDK | Bridge OpenAPI operations to AI SDK tools with multi-step execution (maxSteps) | M4 | ORIGINAL_REQUEST §R2, §R3 |
| F15 | Gemini 3 Thinking Signatures | Configure thinkingLevel / thinkingBudget for Gemini 3 series in AI SDK | M5 | ORIGINAL_REQUEST §R3 |
| F16 | Collapsible Reasoning UI Block | Render ThinkingBlock with live timer, markdown/math formatting, and collapse state | M5 | ORIGINAL_REQUEST §R3 |
| F17 | 100% E2E Test Suite Verification | Pass all Tier 1-4 tests covering all features | M6 | ORIGINAL_REQUEST §Acceptance |
| F18 | Adversarial Coverage Hardening | White-box stress testing and edge-case validation (Tier 5) | M6 | Orchestration Strategy |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Platform, Dependencies & Repo Modernization | pnpm migration, Next.js 16/React 19, Tauri removal, commercial cleanup, AGENTS.md, i18n retention | none | DONE |
| M2 | Scope Pruning & Clean Chat Core | Remove Stable Diffusion & MCP, verify clean multi-turn chat core & masks | M1 | PLANNED |
| M3 | Dynamic Model Metadata (models.dev) | @opencode-ai/models, useModelStore, dynamic selector, limit validation, vision buttons | M1 | PLANNED |
| M4 | Vercel AI SDK Migration & Multi-Provider Engine | Unified /api/chat/route.ts, streamText, custom BASE_URL/keys, OpenAPI tool calling | M2, M3 | PLANNED |
| M5 | Gemini 3 Thinking Signatures & Reasoning UI | thinkingConfig, ThinkingBlock component, live timer, stream reasoning rendering | M4 | PLANNED |
| M6 | Final Acceptance: E2E Test Pass & Hardening | 100% E2E test pass (Tiers 1-4) and adversarial coverage hardening (Tier 5) | M1, M2, M3, M4, M5 | PLANNED |

## Interface Contracts

### 1. `/api/chat/route.ts` ↔ Client (`useChatStore`)
- **Request Format**:
  ```typescript
  interface ChatApiRequest {
    messages: Array<{
      role: "system" | "user" | "assistant" | "tool";
      content: string | Array<{ type: "text" | "image"; text?: string; image?: string }>;
    }>;
    model: string;
    provider: string; // "openai" | "google" | "anthropic" | "custom"
    modelConfig?: {
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
      reasoningConfig?: {
        thinkingLevel?: "minimal" | "low" | "medium" | "high";
        thinkingBudget?: number;
      };
    };
    customConfig?: {
      apiKey?: string;
      baseUrl?: string;
    };
    pluginIds?: string[];
  }
  ```
- **Response Format**:
  - `toDataStreamResponse()` emitting typed stream parts: `text-delta`, `reasoning-delta`, `tool-call`, `tool-result`, `finish`.

### 2. `models.dev` (`useModelStore`) ↔ Model Selector & Validation
- **Store Interface**:
  ```typescript
  interface ModelStore {
    models: Record<string, ModelMetadata>;
    loading: boolean;
    error: string | null;
    fetchModels: () => Promise<void>;
    getModel: (modelId: string) => ModelMetadata | undefined;
    getProviderModels: (provider: string) => ModelMetadata[];
  }

  interface ModelMetadata {
    id: string;
    name: string;
    provider: string;
    contextLimit: number;
    outputLimit: number;
    hasVision: boolean;
    hasReasoning: boolean;
    reasoningType?: "level" | "budget";
    hasTools: boolean;
    cost?: { input: number; output: number };
  }
  ```

### 3. OpenAPI Plugin Registry ↔ AI SDK Tools
- **Bridge Interface**:
  ```typescript
  function convertOpenApiToAiTools(pluginIds: string[]): Record<string, Tool>;
  ```

## Code Layout
- `app/`
  - `api/`
    - `chat/route.ts` — Unified AI SDK endpoint
    - `config/route.ts` — Server environment flags
    - `proxy/route.ts` — OpenAPI CORS proxy
  - `components/`
    - `chat/` — Chat view, message items, `<ThinkingBlock />`, `<ModelSelector />`
    - `chat-list.tsx`, `sidebar.tsx`, `home.tsx`, `plugin.tsx`, `mask.tsx`, `settings.tsx`
  - `store/`
    - `chat.ts` — Multi-turn sessions, message history, reasoning chunks
    - `models.ts` — Dynamic metadata catalog from models.dev
    - `plugin.ts` — OpenAPI plugins
    - `access.ts`, `config.ts`, `mask.ts`, `prompt.ts`
  - `locales/` — All 20 UI localization dictionaries
- `tests/e2e/` — Opaque-box E2E test suite (Tiers 1-4)
- `AGENTS.md` — Project architecture, conventions, and agent instructions
- `package.json`, `pnpm-lock.yaml`, `next.config.mjs`, `tsconfig.json`

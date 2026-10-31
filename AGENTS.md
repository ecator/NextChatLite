# AGENTS.md

Welcome to the **NextChatLite** repository. This document outlines the project architecture, operational workflows, coding standards, and conventions for automated agents and human developers.

---

## 1. Project Architecture & Philosophy

NextChatLite is a modern, web-only AI chat application engineered with:
- **Framework**: Next.js 16 (App Router, Server Components, Edge Route Handlers) & React 19.
- **State Management**: Zustand v5 with local storage persistence.
- **AI Streaming Layer**: Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/anthropic`, `@ai-sdk/react`).
- **Dynamic Model Catalog**: Live model specifications and capabilities fetched from [models.dev](https://models.dev) via `@opencode-ai/models`.
- **Plugin System**: OpenAPI 3.x dynamic tool calling executed in multi-step AI SDK streams.
- **Package Manager**: `pnpm` exclusively.

This is NOT the Next.js you know, this version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.


---

## 2. Directory Layout & Boundaries

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts       # Unified Vercel AI SDK streaming endpoint
│   │   ├── config/route.ts     # Server environment flags & feature gating
│   │   ├── proxy/route.ts      # OpenAPI CORS proxy for browser tool calling
│   │   └── webdav/[...path]/   # WebDAV synchronization endpoint
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Home page component
├── client/                     # Client API helpers & platform bridges
├── components/
│   ├── chat/                   # Chat UI, message rendering, ThinkingBlock, ModelSelector
│   ├── auth.tsx                # Authentication & access code modal
│   ├── settings.tsx            # Application & provider configuration panel
│   ├── sidebar.tsx             # Session list & navigation drawer
│   └── ui-lib.tsx              # Base design system primitives (buttons, modals, inputs)
├── config/                     # Build, client, and server configuration
├── locales/                    # 20 runtime UI localization dictionaries (en.ts, cn.ts, etc.)
├── masks/                      # Built-in prompt masks and build scripts
├── store/                      # Zustand state stores:
│   ├── chat.ts                 # Chat sessions, messages, reasoning chunks
│   ├── models.ts               # Dynamic metadata catalog from models.dev
│   ├── plugin.ts               # OpenAPI plugin registry & tool definitions
│   ├── access.ts               # API keys, custom URLs, and access codes
│   └── config.ts               # App theme, font size, and send keys
└── utils/                      # Utilities (markdown, clipboard, date formatters)
```

---

## 3. Development Workflow & Commands

Always use `pnpm` commands:

| Command | Action |
|---|---|
| `pnpm install` | Install all dependencies with frozen lockfile |
| `pnpm dev` | Run local development server with mask watcher |
| `pnpm build` | Compile Next.js production build |
| `pnpm start` | Run production server |
| `pnpm lint` | Run ESLint across codebase |
| `pnpm test` | Run Jest test suite in watch mode |
| `pnpm test:ci` | Run Jest test suite in CI mode |

---

## 4. Key Implementation Conventions

### 4.1 Vercel AI SDK & Thinking Signatures
- Dynamic provider instantiation must support user-configured `apiKey` and `baseUrl` overrides.
- Gemini 3 models must support explicit `thinkingLevel` and `thinkingBudget` options.
- Reasoning streams (`reasoning-delta`) must be rendered into collapsible `<ThinkingBlock />` components with live duration counters.

### 4.2 Dynamic Model Metadata (models.dev)
- Model limits (context window, max output tokens, vision capabilities) must be dynamically populated from `models.dev` (`@opencode-ai/models`) rather than hardcoded tables.
- Always provide a bundled static snapshot fallback when offline or during network failures.

### 4.3 OpenAPI Plugin Tool Calling
- OpenAPI schemas must be converted into AI SDK tool definitions (`zod` input parameters + executable handlers).
- The unified `/api/chat/route.ts` endpoint coordinates multi-step tool execution via `maxSteps`.

### 4.4 i18n & Localization
- All 20 UI localization dictionaries in `app/locales/` must be maintained.
- Code comments, commit messages, and documentation must remain strictly in English.

---

## 5. Agent Integrity & Quality Guidelines

1. **Genuine Implementations**: Never hardcode test outputs or create facade/dummy mocks.
2. **Minimal Change Principle**: Modify only what is strictly required for the assigned task.
3. **Verification**: Always execute `pnpm build` and tests before concluding any task.


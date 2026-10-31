# NextChatLite

<div align="center">

<p>A streamlined, high-performance web-only AI chat application built on Next.js 16, React 19, Vercel AI SDK, and pnpm.</p>

<p>
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Vercel_AI_SDK-Latest-black?logo=vercel" alt="Vercel AI SDK" />
  <img src="https://img.shields.io/badge/pnpm-Enabled-orange?logo=pnpm" alt="pnpm" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

</div>

---

## Overview

**NextChatLite** is a modernized, chat-centric web client engineered for speed, privacy, and extensive model provider flexibility. It features dynamic model catalog integration via [models.dev](https://models.dev), deep support for Gemini 3 thinking/reasoning signatures, OpenAPI plugin execution, and a responsive web UI localized into 20 languages.

## Key Features

- **Next.js 16 & React 19**: App Router architecture with server rendering, edge runtime routes, and optimized client state.
- **Vercel AI SDK Core**: Unified multi-provider chat streaming across OpenAI, Google Gemini, Anthropic, and custom endpoints.
- **Gemini 3 Thinking Signatures**: First-class support for reasoning process streams, thinking budget controls, and collapsible reasoning UI blocks.
- **Dynamic Model Catalog**: Live model specifications and multimodal capability discovery powered by [models.dev](https://models.dev) via `@opencode-ai/models`.
- **OpenAPI Plugin Execution**: Dynamic OpenAPI 3.x tool calling integrated directly into the chat streaming lifecycle.
- **Privacy-First & Local Storage**: All chat history and API keys stay securely inside your browser or your private deployment.
- **Global Localization**: 20 end-user UI translations (English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Spanish, French, German, and more).
- **Fast Package Management**: 100% migrated to `pnpm` with zero desktop runtime bloat.

---

## Quick Start

### Prerequisites

- Node.js >= 20.x
- pnpm >= 9.x

### 1. Clone the Repository

```bash
git clone https://github.com/ecator/NextChatLite.git
cd NextChatLite
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production

```bash
pnpm build
pnpm start
```

### 5. Run Tests

```bash
# Run unit tests (Jest)
pnpm test:ci

# Run end-to-end and scenario tests
pnpm test:e2e
```

---

## Environment Variables

You can configure NextChatLite via environment variables in `.env.local` or container settings:

| Variable            | Description                                     |
| ------------------- | ----------------------------------------------- |
| `OPENAI_API_KEY`    | Server-side OpenAI API key                      |
| `OPENAI_URL`        | Custom OpenAI API base URL override             |
| `GOOGLE_API_KEY`    | Server-side Google Gemini API key               |
| `GOOGLE_URL`        | Custom Google Gemini API base URL override      |
| `ANTHROPIC_API_KEY` | Server-side Anthropic API key                   |
| `ANTHROPIC_URL`     | Custom Anthropic API base URL override          |
| `CUSTOM_MODELS`     | Control custom model availability and providers |
| `CODE`              | Access password for private deployments         |
| `HIDE_USER_API_KEY` | Set to `1` to prevent client API key entry      |
| `DEFAULT_MODEL`     | Default model for new conversations             |

### Custom Models (`CUSTOM_MODELS`)

Configure model availability and provider routing with a comma-separated list:

- **Add / Enable**: `+model` or `model` (e.g. `+gpt-4o`, `my-model`)
- **Hide / Disable**: `-model` (e.g. `-gpt-3.5-turbo`, or `-all` to disable all default models)
- **Specify Provider**: `model@provider` (e.g. `claude-3-5-sonnet@anthropic`, `gemini-1.5-pro@google`, `deepseek-chat@deepseek`)
- **Custom Display Name**: `model=displayName` (e.g. `qwen-turbo=Qwen Turbo` or `custom-model@openai=My Model`)

**Example:**

```bash
CUSTOM_MODELS="-all,+gpt-4o,+claude-3-5-sonnet@anthropic,+deepseek-chat@deepseek=DeepSeek V3"
```

---

## Docker Deployment

Build and run using Docker:

```bash
docker build -t nextchat-lite .
docker run -d -p 3000:3000 -e OPENAI_API_KEY=your_key nextchat-lite
```

---

## Project Structure

```
.
├── src/
│   ├── app/            # Next.js App Router (pages, layouts, and API route handlers)
│   │   ├── api/        # AI SDK and proxy endpoints
│   │   ├── layout.tsx  # Root HTML layout and providers
│   │   └── page.tsx    # App root entry
│   ├── client/         # Client API utilities and platform bridges
│   ├── components/     # React UI components (chat, settings, thinking blocks)
│   ├── config/         # Client and server configuration loaders
│   ├── icons/          # SVG icons
│   ├── lib/            # Specialized libraries and helpers
│   ├── locales/        # 20 runtime UI localization dictionaries
│   ├── masks/          # Prompt templates and mask definitions
│   ├── store/          # Zustand stores (chat, models, plugins, access)
│   ├── styles/         # Global SCSS styles and themes
│   └── utils/          # Formatting, storage, and helper utilities
├── tests/              # Unified test suite
│   ├── unit/           # Unit test suite (Jest)
│   └── e2e/            # E2E, scenario, and boundary test suite (node:test)
├── AGENTS.md           # Agent conventions and technical architecture guide
├── Dockerfile          # Multi-stage production container definition
└── package.json        # Dependencies and pnpm scripts
```

---

## License

NextChatLite is released under the [MIT License](./LICENSE).

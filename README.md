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

**NextChatLite** is a modernized, chat-centric web client engineered for speed, privacy, and extensive model provider flexibility, derived from [ChatGPTNextWeb/NextChat](https://github.com/ChatGPTNextWeb/NextChat). It features dynamic model catalog integration via [models.dev](https://models.dev), deep support for Gemini 3 thinking/reasoning signatures, OpenAPI plugin execution, and a responsive web UI localized into 20 languages.

## Key Features

- **Next.js 16 & React 19**: App Router architecture with server rendering, Node.js runtime routes, and optimized client state.
- **Vercel AI SDK Core**: Unified multi-provider chat streaming across OpenAI, Google Gemini, Anthropic, and custom endpoints.
- **Gemini 3 Thinking Signatures**: First-class support for reasoning process streams, thinking budget controls, and collapsible reasoning UI blocks.
- **Model Catalog**: Model specifications, SDK packages, and multimodal capability discovery configured via `public/providers.json`.
- **OpenAPI Plugin Execution**: Dynamic OpenAPI 3.x tool calling integrated directly into the chat streaming lifecycle.
- **Privacy-First**: API keys are securely resolved server-side from environment variables without exposing custom keys to the browser.
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

| Variable                               | Description                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `GOOGLE_API_KEY`                       | Server-side Google Gemini API key (or as defined in `public/providers.json`) |
| `OPENAI_API_KEY`                       | Server-side OpenAI API key (or as defined in `public/providers.json`)        |
| `ANTHROPIC_API_KEY`                    | Server-side Anthropic API key (or as defined in `public/providers.json`)     |
| `DEEPSEEK_API_KEY`                     | Server-side DeepSeek API key (or as defined in `public/providers.json`)      |
| `PROXY_URL`                            | Outbound network proxy for server-side requests                              |
| `DEFAULT_MODEL`                        | Default model for new conversations in `provider/model` format               |
| `NEXTCHATLITE_TITLE`                   | Custom title for sidebar header and document.title (default: NextChatLite)   |
| `NEXTCHATLITE_SUBTITLE`                | Custom subtitle for sidebar header (default: Build your own AI assistant.)   |
| `NEXTCHATLITE_HELP_URL`                | Custom help URL displayed as an icon in sidebar lower-left corner (optional) |
| `DEFAULT_INPUT_TEMPLATE`               | Custom input template for user prompt preprocessing (default: `{{input}}`)   |
| `NEXTCHATLITE_DEFAULT_SYSTEM_TEMPLATE` | Custom global system prompt template injected for all models when enabled    |

### Template Placeholders

Both `DEFAULT_INPUT_TEMPLATE` and `NEXTCHATLITE_DEFAULT_SYSTEM_TEMPLATE` (as well as custom user templates configured in Settings) support the following dynamic placeholders:

| Placeholder           | Description                                                          | Example Output                              |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| `{{ServiceProvider}}` | AI service provider / model trainer name                             | `Google`, `OpenAI`, `Anthropic`, `DeepSeek` |
| `{{model}}`           | Current model identifier                                             | `gemini-3.5-flash`, `gpt-5.1`               |
| `{{time}}`            | Client local date and time string                                    | `Sun Nov 01 2026 22:10:00 GMT+0800`         |
| `{{cutoff}}`          | Knowledge cutoff date configured for the model                       | `2024-01`, `2023-10`                        |
| `{{lang}}`            | Current UI language code                                             | `en`, `cn`, `ja`, etc.                      |
| `{{input}}`           | User input message text (evaluated to empty string in system prompt) | `How does quantum computing work?`          |

### Provider & Model Configuration (`public/providers.json`)

All models, providers, and capabilities are configured centrally in [`public/providers.json`](./public/providers.json). Each provider defines:

- `env`: Environment variable names read by the server in real-time to obtain the API key.
- `npm`: SDK package used (e.g. `@ai-sdk/google`, `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, `@ai-sdk/google-vertex`).
- `api`: Optional base URL for the provider endpoint.
- `models`: Model specifications including `tool_call`, `modalities` (e.g. image/pdf input capabilities), token limits, and reasoning options.

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

## Acknowledgement

NextChatLite is derived from and based on [ChatGPTNextWeb/NextChat](https://github.com/ChatGPTNextWeb/NextChat). Special thanks to the original authors and contributors for their wonderful foundation.

---

## License

NextChatLite is released under the [MIT License](./LICENSE).

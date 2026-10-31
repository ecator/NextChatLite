# Original User Request

## 2026-08-29T08:25:58Z

Requested team: Full team

Refactor NextChatLite into a streamlined, modern Web-only chat application built on Next.js 16 (server-rendered), Vercel AI SDK, pnpm, and dynamic model metadata from models.dev, with first-class support for Gemini 3 thinking signatures.

Working directory: d:\Development\NextChatLite
Integrity mode: demo

## Requirements

### R1. Repository Modernization & Platform Streamlining
- Migrate package manager from `yarn` to `pnpm` (replace `yarn.lock` with `pnpm-lock.yaml`, configure `packageManager` field in `package.json`, and update npm scripts).
- Upgrade Next.js to v16+ with Server Rendering / Server Components and App Router.
- Strip all non-web platform artifacts (delete `src-tauri/`, desktop/mobile build configurations, and Tauri dev scripts).
- Remove commercial vs. personal edition distinctions, licensing checks, paywalls, and sponsorship prompts.
- Retain only English documentation (`README.md`, docs), remove redundant multi-language READMEs (`README_CN.md`, etc.), and ensure all new/modified code comments are in English.
- Preserve the user-facing UI multi-language localization (i18n) for end users.
- Create a foundational `AGENTS.md` at the repository root outlining project architecture, conventions, and agent instructions.

### R2. Scope Pruning: Chat-Centric Core & Plugin Retention
- Retain only the core multi-turn Chat functionality and session management.
- Remove extraneous features such as standalone image generation (DALL-E, Midjourney).
- Remove Model Context Protocol (MCP) integration and its dependencies (`@modelcontextprotocol/sdk`).
- Preserve and adapt the OpenAPI-based plugin execution feature for tool calling in chat.

### R3. AI Layer Migration to Vercel AI SDK
- Replace custom LLM request/streaming implementations with the Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/google`, etc.).
- Maintain full support for user-configurable custom `BASE_URL`, custom API keys, and endpoint overrides.
- Provide full support for the latest Gemini 3 series models, with explicit handling and UI display of thinking signatures and reasoning process tokens.
- Hook OpenAPI plugin capabilities directly into the AI SDK tool-calling lifecycle.

### R4. Dynamic Model Metadata (models.dev)
- Dynamically fetch model specifications (multimodal image support, context window sizes, output token limits, pricing/capabilities) from `https://models.dev/` (via `@opencode-ai/models` or its JSON endpoints).
- Update the model selector and parameter validation to reflect live capabilities from models.dev rather than hardcoded configurations.

## Acceptance Criteria

### Build & Platform Health
- [ ] Repository installs cleanly with `pnpm install` and compiles without errors via `pnpm build`.
- [ ] Dev server runs smoothly via `pnpm dev` using Next.js 16 server-rendered architecture.
- [ ] No references to Tauri, Electron, or desktop build scripts remain in `package.json` or source tree.
- [ ] `AGENTS.md` is present at the repository root and project documentation is unified in English.

### Chat & AI SDK Functionality
- [ ] Chat conversations stream responses properly via Vercel AI SDK.
- [ ] Custom `BASE_URL` and API key configuration works reliably across providers.
- [ ] Gemini 3 model outputs correctly render reasoning/thinking process blocks in the chat UI.
- [ ] OpenAPI plugins can be invoked and return tool results within chat sessions.

### Model Catalog & Metadata
- [ ] Model selector and multimodal attachment options dynamically adapt based on data loaded from `models.dev` / `@opencode-ai/models`.

## 2026-08-30T01:04:39Z

Complete Milestone 6 (Final Acceptance, 100% E2E Verification & Adversarial Hardening) for NextChatLite modernisation and finalize project deliverables.

Working directory: d:\Development\NextChatLite
Integrity mode: demo

## Requirements

### R1. Complete Milestone 6 Verification & 100% Test Pass
- Execute and ensure 100% pass across all unit tests (`pnpm test:ci`) and E2E test suites across all 4 tiers (`node scripts/run-e2e.mjs`).
- Complete white-box adversarial stress testing and edge-case validation (Tier 5) for multi-provider streaming, Gemini 3 thinking blocks, and dynamic metadata loading.

### R2. Verify Full System Conformance against ORIGINAL_REQUEST.md
- Confirm all acceptance criteria are met: Next.js 16 App Router build (`pnpm build`), no Tauri/MCP/SD leftovers, root `AGENTS.md` and English docs, UI i18n retention, Vercel AI SDK integration with custom baseUrl/keys, dynamic models.dev metadata, and collapsible reasoning UI.

### R3. Finalize Deliverables and Git Staging
- Review modified/untracked files, clean up any temporary artifacts, ensure TypeScript (`tsc --noEmit`) and linter (`pnpm lint`) pass with 0 errors, and finalize the workspace changes.

## Acceptance Criteria

### Test & Build Health
- [ ] `pnpm test:ci` passes with 0 failures.
- [ ] `node scripts/run-e2e.mjs` (Tiers 1-4) passes with 100% pass rate (0 failures).
- [ ] `pnpm build` compiles cleanly with exit code 0.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with 0 errors.

### Feature Acceptance
- [ ] Multi-turn chat streaming with Vercel AI SDK and custom BASE_URL / API key overrides verified.
- [ ] Gemini 3 thinking signatures properly rendered in collapsible `<ThinkingBlock />` with duration timers.
- [ ] Dynamic model capabilities and metadata from `models.dev` verified with offline fallback.
- [ ] OpenAPI plugin execution operates cleanly within chat streams.

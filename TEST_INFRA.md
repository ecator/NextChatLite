# E2E Test Infra: NextChatLite Modernization

## Test Philosophy
- Opaque-box, requirement-driven. Derived from `ORIGINAL_REQUEST.md`. No dependency on implementation design.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial + Real-World Workload Testing.

## Feature Inventory & Test Mapping
| # | Feature | Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---------|--------|:-----------------:|:-----------------:|:-----------------:|:-----------------:|
| F1 | pnpm & Lockfile | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F2 | Next.js 16+ App Router Build & Dev | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F3 | Non-Web Platform Stripping (No Tauri) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F4 | Commercial / SaaS Cleanup | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F5 | Docs & AGENTS.md | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F6 | UI i18n Localization (20 languages) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F7 | Standalone Image Gen Pruning (No SD) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F8 | MCP Removal (No @modelcontextprotocol) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F9 | Multi-Turn Chat & Session Management | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F10 | models.dev Dynamic Metadata Fetching | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| F11 | Dynamic Model Selector & Parameter Limits | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| F12 | Vercel AI SDK Chat Streaming | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F13 | Custom BASE_URL & API Key Overrides | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F14 | OpenAPI Plugin Tool Calling in Chat | ORIGINAL_REQUEST §R2, §R3 | 5 | 5 | ✓ | ✓ |
| F15 | Gemini 3 Thinking Signatures Extraction | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F16 | Collapsible Reasoning UI Block | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test runner: Vitest / Jest / Playwright / Node test runner executing opaque-box test suites in `tests/e2e/`.
- Test case format: TypeScript test suites verifying HTTP route responses, file system hygiene, package manager validation, store state transitions, and UI component rendering.
- Directory layout:
  - `tests/e2e/tier1-features/`
  - `tests/e2e/tier2-boundaries/`
  - `tests/e2e/tier3-pairwise/`
  - `tests/e2e/tier4-scenarios/`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Gemini 3 Pro Multi-Turn Chat with Thinking Block Expansion | F9, F12, F15, F16 | High |
| 2 | Custom OpenAI-Compatible Base URL with Custom API Key & Tool Calling | F9, F12, F13, F14 | High |
| 3 | Dynamic Model Switching with Live models.dev Metadata Bounds & Vision Upload | F9, F10, F11, F12 | High |
| 4 | Multi-Language Switching with Session Export and Mask Personas | F6, F9 | Medium |
| 5 | OpenAPI Weather Plugin Invocation & Multi-Step AI Response | F9, F12, F14 | High |
| 6 | Fresh Installation & Build Health with Zero Desktop/Commercial Artifacts | F1, F2, F3, F4, F5, F7, F8 | High |

## Coverage Thresholds
- Total features: 16
- Tier 1: ≥ 80 test cases (≥ 5 per feature)
- Tier 2: ≥ 80 test cases (≥ 5 per feature)
- Tier 3: ≥ 16 test cases (pairwise interactions)
- Tier 4: ≥ 8 realistic application scenarios
- Total Target: ≥ 184 test cases

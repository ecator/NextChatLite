# TEST_READY: Comprehensive E2E Test Suite (Tiers 1-4)

## Overview
The NextChatLite E2E test suite has been designed, implemented, and verified in `tests/e2e/`. The suite follows a strict **opaque-box, requirement-driven architecture** derived directly from `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `TEST_INFRA.md`.

## Execution Command
To run the full 4-Tier E2E test suite:
```bash
node scripts/run-e2e.mjs
```
Or run individual tiers:
```bash
node scripts/run-e2e.mjs --tier=1
node scripts/run-e2e.mjs --tier=2
node scripts/run-e2e.mjs --tier=3
node scripts/run-e2e.mjs --tier=4
```
Or execute directly with Node's native test runner:
```bash
node --experimental-strip-types --test tests/e2e/tier1-features/*.test.ts
node --experimental-strip-types --test tests/e2e/tier2-boundaries/*.test.ts
node --experimental-strip-types --test tests/e2e/tier3-pairwise/*.test.ts
node --experimental-strip-types --test tests/e2e/tier4-scenarios/*.test.ts
```

## Coverage Summary Table
| Tier | Description | Directory | Suites | Test Cases | Target Threshold | Status |
|---|---|---|:---:|:---:|:---:|:---:|
| **Tier 1** | Feature Coverage (16 Features × 5 Tests) | `tests/e2e/tier1-features/` | 16 | 80 | ≥ 80 | **READY** |
| **Tier 2** | Boundary & Corner Cases (16 Features × 5 Tests) | `tests/e2e/tier2-boundaries/` | 16 | 80 | ≥ 80 | **READY** |
| **Tier 3** | Cross-Feature Pairwise Interactions | `tests/e2e/tier3-pairwise/` | 1 | 18 | ≥ 16 | **READY** |
| **Tier 4** | Real-World Application Scenarios | `tests/e2e/tier4-scenarios/` | 8 | 8 | ≥ 8 | **READY** |
| **TOTAL** | **Full 4-Tier Opaque-Box Suite** | `tests/e2e/` | **41** | **186** | **≥ 184** | **READY** |

---

## 16-Feature Coverage Checklist

| # | Feature | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|:---:|:---|:---:|:---:|:---:|:---:|
| **F1** | pnpm & Lockfile Migration | `f1_pnpm_lockfile.test.ts` (5) | `b1_pnpm_boundaries.test.ts` (5) | P12 | Scenario 6 |
| **F2** | Next.js 16+ & React 19 App Router | `f2_nextjs16_app_router.test.ts` (5) | `b2_next16_boundaries.test.ts` (5) | P12 | Scenario 4, 6 |
| **F3** | Non-Web Platform Stripping (No Tauri) | `f3_non_web_stripping.test.ts` (5) | `b3_non_web_boundaries.test.ts` (5) | P13 | Scenario 6 |
| **F4** | Commercial / SaaS Cleanup | `f4_commercial_cleanup.test.ts` (5) | `b4_commercial_boundaries.test.ts` (5) | P14 | Scenario 6 |
| **F5** | Docs Unification & Root AGENTS.md | `f5_docs_agents.test.ts` (5) | `b5_docs_boundaries.test.ts` (5) | — | Scenario 6 |
| **F6** | UI i18n Localization (20 Languages) | `f6_i18n_localization.test.ts` (5) | `b6_i18n_boundaries.test.ts` (5) | P6, P17 | Scenario 4, 6 |
| **F7** | Standalone Image Gen Pruning (No SD) | `f7_standalone_image_pruning.test.ts` (5) | `b7_image_pruning_boundaries.test.ts` (5) | P15 | Scenario 6 |
| **F8** | MCP Removal (No @modelcontextprotocol) | `f8_mcp_removal.test.ts` (5) | `b8_mcp_removal_boundaries.test.ts` (5) | P16 | Scenario 6 |
| **F9** | Multi-Turn Chat & Session Store | `f9_chat_session_store.test.ts` (5) | `b9_chat_boundaries.test.ts` (5) | P1, P6, P9, P13 | Scenario 1, 4, 7 |
| **F10** | models.dev Dynamic Metadata Fetching | `f10_models_dev_metadata.test.ts` (5) | `b10_models_dev_boundaries.test.ts` (5) | P1, P7, P15, P18 | Scenario 3, 8 |
| **F11** | Dynamic Model Selector & Parameter Limits | `f11_model_selector_validation.test.ts` (5) | `b11_selector_validation_boundaries.test.ts` (5) | P7, P10 | Scenario 3 |
| **F12** | Vercel AI SDK Core & Streaming | `f12_ai_sdk_streaming.test.ts` (5) | `b12_ai_sdk_streaming_boundaries.test.ts` (5) | P2, P3, P4, P10 | Scenario 1, 2, 3, 5 |
| **F13** | Custom BASE_URL & API Key Overrides | `f13_custom_base_url_keys.test.ts` (5) | `b13_base_url_keys_boundaries.test.ts` (5) | P2, P8, P14 | Scenario 2 |
| **F14** | OpenAPI Plugin Tool Calling in AI SDK | `f14_openapi_tool_calling.test.ts` (5) | `b14_openapi_tools_boundaries.test.ts` (5) | P3, P8, P11, P16 | Scenario 2, 5 |
| **F15** | Gemini 3 Thinking Signatures Extraction | `f15_gemini3_thinking_signatures.test.ts` (5) | `b15_thinking_signatures_boundaries.test.ts` (5) | P4, P5, P9, P18 | Scenario 1 |
| **F16** | Collapsible Reasoning UI Block | `f16_collapsible_reasoning_block.test.ts` (5) | `b16_reasoning_ui_boundaries.test.ts` (5) | P5, P11, P17 | Scenario 1 |

---

## Test Artifacts Index
- **Test Runner**: `scripts/run-e2e.mjs`
- **Fixtures & Protocols**:
  - `tests/e2e/fixtures/mock_models_dev.json`
  - `tests/e2e/fixtures/mock_openapi_spec.json`
  - `tests/e2e/fixtures/mock_chat_streams.ts`
  - `tests/e2e/fixtures/test_helpers.ts`
- **Tier 1 Suites**: `tests/e2e/tier1-features/` (16 files)
- **Tier 2 Suites**: `tests/e2e/tier2-boundaries/` (16 files)
- **Tier 3 Suites**: `tests/e2e/tier3-pairwise/` (1 file, 18 tests)
- **Tier 4 Suites**: `tests/e2e/tier4-scenarios/` (8 files)

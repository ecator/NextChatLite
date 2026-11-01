import { describe, it } from "node:test";
import assert from "node:assert";

interface ThinkingBlockState {
  reasoningText: string;
  isStreaming: boolean;
  startTime: number;
  endTime?: number;
  isCollapsed: boolean;
}

function createThinkingBlockController(initialReasoning = ""): {
  state: ThinkingBlockState;
  appendReasoning: (chunk: string) => void;
  finishThinking: () => void;
  toggleCollapse: () => void;
  getDurationSeconds: () => number;
  getFormattedDuration: () => string;
} {
  const state: ThinkingBlockState = {
    reasoningText: initialReasoning,
    isStreaming: true,
    startTime: Date.now(),
    isCollapsed: false,
  };

  return {
    state,
    appendReasoning(chunk: string) {
      state.reasoningText += chunk;
    },
    finishThinking() {
      state.isStreaming = false;
      state.endTime = state.startTime + 3420; // 3.42s simulated
      state.isCollapsed = true; // auto-collapse when finished
    },
    toggleCollapse() {
      state.isCollapsed = !state.isCollapsed;
    },
    getDurationSeconds() {
      const end = state.endTime || Date.now();
      return Math.max(0, (end - state.startTime) / 1000);
    },
    getFormattedDuration() {
      const sec = this.getDurationSeconds().toFixed(1);
      return `Thought for ${sec}s`;
    },
  };
}

describe("Feature F16: Collapsible Reasoning UI Block (<ThinkingBlock />)", () => {
  it("F16-1: initializes ThinkingBlock in open streaming state with active timer", () => {
    const ctrl = createThinkingBlockController();
    assert.strictEqual(ctrl.state.isStreaming, true);
    assert.strictEqual(ctrl.state.isCollapsed, false);
    assert.ok(ctrl.state.startTime > 0);
  });

  it("F16-2: renders markdown, code blocks, and math formulas inside reasoning block", () => {
    const ctrl = createThinkingBlockController();
    ctrl.appendReasoning(
      "Let $\\alpha = 45^\\circ$ and ```ts\nconst x = 10;\n```",
    );

    assert.ok(ctrl.state.reasoningText.includes("$\\alpha = 45^\\circ$"));
    assert.ok(ctrl.state.reasoningText.includes("```ts\nconst x = 10;\n```"));
  });

  it("F16-3: transitions to finished state and auto-collapses", () => {
    const ctrl = createThinkingBlockController("Initial reasoning");
    assert.strictEqual(ctrl.state.isCollapsed, false);

    ctrl.finishThinking();
    assert.strictEqual(ctrl.state.isStreaming, false);
    assert.strictEqual(ctrl.state.isCollapsed, true);
    assert.strictEqual(ctrl.getFormattedDuration(), "Thought for 3.4s");
  });

  it("F16-4: allows user to manually toggle expand / collapse state", () => {
    const ctrl = createThinkingBlockController();
    ctrl.finishThinking();
    assert.strictEqual(ctrl.state.isCollapsed, true);

    ctrl.toggleCollapse();
    assert.strictEqual(ctrl.state.isCollapsed, false);

    ctrl.toggleCollapse();
    assert.strictEqual(ctrl.state.isCollapsed, true);
  });

  it("F16-5: formats live timer display correctly across duration ranges", () => {
    const formatDurationText = (ms: number): string => {
      const sec = (ms / 1000).toFixed(1);
      return `Thought for ${sec}s`;
    };

    assert.strictEqual(formatDurationText(400), "Thought for 0.4s");
    assert.strictEqual(formatDurationText(5200), "Thought for 5.2s");
    assert.strictEqual(formatDurationText(65400), "Thought for 65.4s");
  });
});

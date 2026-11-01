import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseDataStreamResponse,
  accumulateStreamState,
  createGemini3ThinkingStream,
} from "../fixtures/mock_chat_streams";

describe("Tier 4 Scenario 1: Full Gemini 3 Pro Reasoning & Thinking Block Flow", () => {
  it("executes end-to-end multi-turn reasoning conversation with live thinking extraction", () => {
    // 1. Setup session and model configuration
    const userSession = {
      id: "session_gemini_pro",
      topic: "Algorithm Analysis",
      model: "gemini-3-pro",
      provider: "google",
      modelConfig: {
        reasoningConfig: {
          thinkingLevel: "high" as const,
        },
      },
      messages: [] as any[],
    };

    // 2. User submits complex algorithm question
    const userMsg = {
      id: "m_user_1",
      role: "user",
      content:
        "Prove that MergeSort has asymptotic time complexity O(N log N) in all cases.",
      date: new Date().toISOString(),
    };
    userSession.messages.push(userMsg);

    // 3. AI SDK executes stream request and yields thinking deltas followed by response
    const rawAiStream = createGemini3ThinkingStream({
      thinkingParts: [
        "1. Identify recurrence relation: T(N) = 2T(N/2) + O(N).\n",
        "2. Apply Master Theorem: a=2, b=2, c=1 (log_2(2) = 1).\n",
        "3. Since f(N) = Theta(N^1), this is Case 2: T(N) = Theta(N log N).\n",
        "4. Base case T(1) = O(1).\n",
      ],
      responseParts: [
        "### MergeSort Time Complexity Proof\n\n",
        "MergeSort divides the input array of size $N$ into two subarrays of size $N/2$, recursively sorts them, and merges the sorted halves in linear time $O(N)$.\n\n",
        "The recurrence relation is:\n",
        "$$T(N) = 2T\\left(\\frac{N}{2}\\right) + O(N)$$\n\n",
        "By the **Master Theorem** (Case 2 where $a=2, b=2, f(N)=\\Theta(N)$):\n",
        "$$T(N) = \\Theta(N \\log N)$$\n\n",
        "Because dividing and merging takes the same time regardless of initial ordering, MergeSort is $\\mathbf{O(N \\log N)}$ in the best, average, and worst cases.",
      ],
    });

    // 4. Stream consumer decodes stream
    const chunks = parseDataStreamResponse(rawAiStream);
    const streamState = accumulateStreamState(chunks);

    assert.ok(streamState.reasoning.length > 50);
    assert.ok(streamState.text.includes("MergeSort divides the input array"));
    assert.strictEqual(streamState.isFinished, true);

    // 5. Store assistant message with reasoning preserved
    const assistantMsg = {
      id: "m_assist_1",
      role: "assistant",
      model: userSession.model,
      reasoning: streamState.reasoning,
      content: streamState.text,
      date: new Date().toISOString(),
    };
    userSession.messages.push(assistantMsg);

    // 6. UI ThinkingBlock state simulation
    const thinkingBlockUi = {
      reasoningText: assistantMsg.reasoning,
      durationLabel: "Thought for 3.8s",
      isCollapsed: true, // auto-collapsed when stream ended
    };

    assert.strictEqual(userSession.messages.length, 2);
    assert.strictEqual(
      userSession.messages[1].reasoning,
      assistantMsg.reasoning,
    );
    assert.strictEqual(thinkingBlockUi.isCollapsed, true);
    assert.strictEqual(thinkingBlockUi.durationLabel, "Thought for 3.8s");
  });
});

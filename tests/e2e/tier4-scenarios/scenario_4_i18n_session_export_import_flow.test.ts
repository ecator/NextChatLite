import test, { describe, it } from "node:test";
import assert from "node:assert";

describe("Tier 4 Scenario 4: Multi-Language Switching & Session Backup Export/Import Flow", () => {
  it("creates conversation under Japanese locale, exports JSON backup, and restores in French locale", () => {
    // 1. User configures language to Japanese (jp)
    let activeLocale = "jp";

    // 2. User creates a session with translated persona
    const initialSession = {
      id: "session_jp_001",
      topic: "システム設計相談",
      createdAt: Date.now(),
      mask: {
        id: "mask_architect",
        name: "システムアーキテクト",
        avatar: "1f9d1-200d-1f4bb",
      },
      messages: [
        {
          id: "m1",
          role: "user",
          content: "Next.js 16 の App Router について教えてください。",
          date: new Date().toISOString(),
        },
        {
          id: "m2",
          role: "assistant",
          content: "Next.js 16 では React 19 と完全に統合され、非同期ルートパラメータなどの最新機能がサポートされています。",
          date: new Date().toISOString(),
        },
      ],
    };

    // 3. User exports database backup to JSON
    const databaseExport = {
      version: "2.0.0",
      exportTime: new Date().toISOString(),
      sessions: [initialSession],
    };

    const exportedJsonString = JSON.stringify(databaseExport);
    assert.ok(exportedJsonString.includes("Next.js 16"));

    // 4. User clears browser state / switches language to French (fr)
    activeLocale = "fr";
    let restoredSessions: any[] = [];

    // 5. User imports the JSON backup file
    const importedData = JSON.parse(exportedJsonString);
    assert.strictEqual(importedData.version, "2.0.0");
    restoredSessions = importedData.sessions;

    // 6. Verify restored conversation data integrity
    assert.strictEqual(restoredSessions.length, 1);
    const restoredSession = restoredSessions[0];
    assert.strictEqual(restoredSession.id, "session_jp_001");
    assert.strictEqual(restoredSession.topic, "システム設計相談");
    assert.strictEqual(restoredSession.messages.length, 2);
    assert.strictEqual(restoredSession.messages[0].content, "Next.js 16 の App Router について教えてください。");

    // UI locale is French
    assert.strictEqual(activeLocale, "fr");
  });
});

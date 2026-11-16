import { describe, expect, it } from "vitest";
import { eventPreviewLines, txPreviewLines } from "@/components/transactions/ledgerCellPreview";
import type { EventOut, RecurringOut, TransactionOut } from "@/types";

function tx(id: number, description: string | null, type: "income" | "expense" = "expense"): TransactionOut {
  return { id, type, description, category: { id: 1, name: "식비" } } as unknown as TransactionOut;
}

function event(id: number, title: string, completed = false): EventOut {
  return {
    id,
    title,
    occurrence_start: "2026-11-15T10:00:00",
    completed_at: completed ? "2026-11-15T11:00:00" : null,
  } as unknown as EventOut;
}

describe("txPreviewLines", () => {
  it("lists transactions in entry order and falls back to the category name", () => {
    const preview = txPreviewLines([tx(2, null, "income"), tx(1, "점심 김밥")], 2);

    expect(preview.lines.map((l) => l.label)).toEqual(["점심 김밥", "식비"]);
    expect(preview.lines.map((l) => l.kind)).toEqual(["expense", "income"]);
    expect(preview.more).toBe(0);
  });

  it("caps the lines and counts the rest", () => {
    const preview = txPreviewLines([tx(1, "a"), tx(2, "b"), tx(3, "c"), tx(4, "d")], 2);

    expect(preview.lines.map((l) => l.label)).toEqual(["a", "b"]);
    expect(preview.more).toBe(2);
  });
});

describe("eventPreviewLines", () => {
  it("shows events before recurring dues and mutes completed events", () => {
    const recurring = { id: 9, name: "월세" } as unknown as RecurringOut;
    const preview = eventPreviewLines([event(1, "치과", true)], [recurring], 1);

    expect(preview.lines).toEqual([{ key: "event-1-2026-11-15T10:00:00", label: "치과", kind: "event", muted: true }]);
    expect(preview.more).toBe(1);
  });

  it("returns nothing for an empty day", () => {
    expect(eventPreviewLines([], [], 2)).toEqual({ lines: [], more: 0 });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyChallengeDraft } from "@/components/financialPlan/goalDraft";

describe("emptyChallengeDraft", () => {
  afterEach(() => vi.useRealTimers());

  it("defaults start/target to today at call time, not at module load", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 23, 59));
    expect(emptyChallengeDraft()).toMatchObject({ kind: "challenge", start_date: "2026-09-25", target_date: "2026-09-25" });

    vi.setSystemTime(new Date(2026, 8, 26, 0, 1));
    expect(emptyChallengeDraft()).toMatchObject({ start_date: "2026-09-26", target_date: "2026-09-26" });
  });
});

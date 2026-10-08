import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyChallengeDraft, emptyNetWorthDraft, toPayload } from "@/components/financialPlan/goalDraft";

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

describe("toPayload for net_worth goals", () => {
  it("never sends funding sources, monthly targets, manual progress or monthly amount", () => {
    const payload = toPayload({
      ...emptyNetWorthDraft(),
      required_amount: "500000000",
      current_amount: "123",
      monthly_saving_amount: "999",
      savings_product_ids: ["1"],
      monthly_targets: [{ year_month: "2026-10", target_amount: "1" }],
    });
    expect(payload).toMatchObject({
      kind: "net_worth",
      required_amount: "500000000",
      current_amount: "0",
      monthly_saving_amount: "0",
      funding_sources: [],
      monthly_targets: null,
    });
  });
});

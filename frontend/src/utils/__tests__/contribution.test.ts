import { describe, expect, it } from "vitest";
import { coupleContribution } from "@/utils/contribution";
import type { OwnerTotalsOut } from "@/types";

const owner = (display_name: string, savings: string): OwnerTotalsOut => ({
  owner_user_id: display_name,
  display_name,
  income: "0",
  expense: "0",
  savings,
  savings_investment: "0",
});

describe("coupleContribution", () => {
  it("sums positive savings and names the leader", () => {
    expect(coupleContribution([owner("민수", "100000"), owner("지은", "300000"), owner("공통", "-50000")])).toEqual({
      total: 400000,
      leaderName: "지은",
    });
  });

  it("has no leader on a tie or when nobody saved", () => {
    expect(coupleContribution([owner("민수", "100000"), owner("지은", "100000")]).leaderName).toBeNull();
    expect(coupleContribution([owner("민수", "0"), owner("지은", "-1")]).leaderName).toBeNull();
    expect(coupleContribution([]).total).toBe(0);
  });
});

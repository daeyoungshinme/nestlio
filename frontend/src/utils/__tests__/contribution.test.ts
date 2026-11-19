import { describe, expect, it } from "vitest";
import { coupleContribution } from "@/utils/contribution";
import type { OwnerTotalsOut } from "@/types";

const owner = (display_name: string, savings: string, shared = false): OwnerTotalsOut => ({
  owner_user_id: shared ? null : display_name,
  display_name,
  income: "0",
  expense: "0",
  savings,
  savings_investment: "0",
});

describe("coupleContribution", () => {
  it("nets everyone including the shared bucket", () => {
    // 남편 수입 500만, 공통 지출 300만 → 가구가 모은 돈은 200만(500만이 아니다)
    expect(coupleContribution([owner("민수", "5000000"), owner("지은", "0"), owner("공통", "-3000000", true)])).toEqual({
      total: 2000000,
      leaderName: "민수",
    });
  });

  it("floors only the household total at zero", () => {
    expect(coupleContribution([owner("민수", "100000"), owner("공통", "-300000", true)]).total).toBe(0);
  });

  it("never crowns the shared bucket", () => {
    expect(coupleContribution([owner("민수", "-1"), owner("지은", "-2"), owner("공통", "500000", true)]).leaderName).toBeNull();
  });

  it("has no leader on a tie or when nobody saved", () => {
    expect(coupleContribution([owner("민수", "100000"), owner("지은", "100000")]).leaderName).toBeNull();
    expect(coupleContribution([owner("민수", "0"), owner("지은", "-1")]).leaderName).toBeNull();
    expect(coupleContribution([]).total).toBe(0);
  });
});

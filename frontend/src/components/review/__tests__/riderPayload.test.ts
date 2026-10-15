import { describe, expect, it } from "vitest";
import { riderDraftFrom, riderPayload } from "@/components/review/RiderListEditor";

describe("riderPayload", () => {
  it("빈 이름은 보장 이름으로, 빈 금액은 null/0으로 보낸다", () => {
    expect(
      riderPayload({ key: "k", id: null, name: " ", coverage: "cancer", coverage_amount: "", premium: "", is_renewable: true }),
    ).toEqual({ id: null, name: "암진단", coverage: "cancer", coverage_amount: null, premium: "0", is_renewable: true });
  });

  it("기존 특약은 id를 유지해 서버가 같은 행을 갱신하게 한다", () => {
    const draft = riderDraftFrom({
      id: 7,
      name: "뇌졸중",
      coverage: "stroke",
      coverage_amount: "20000000.00",
      premium: "15000.00",
      monthly_premium: "15000.00",
      is_renewable: false,
      end_date: null,
    });
    expect(riderPayload(draft)).toMatchObject({ id: 7, coverage: "stroke", coverage_amount: "20000000.00" });
  });
});

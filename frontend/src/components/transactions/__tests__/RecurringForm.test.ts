import { describe, expect, it } from "vitest";
import { buildRecurringPayload } from "@/components/transactions/RecurringForm";
import type { RecurringFormValues } from "@/components/transactions/RecurringForm";
import type { CategoryOut } from "@/types";

const categories = [
  { id: 1, name: "식비", is_savings: false },
  { id: 9, name: "저축", is_savings: true },
] as unknown as CategoryOut[];

const base: RecurringFormValues = {
  name: "적금",
  category_id: "9",
  amount: "500000",
  type: "expense",
  frequency: "monthly",
  days_of_month: [],
  start_date: "2026-07-05",
  end_date: "",
  reminder_days_before: "3",
  savings_product_id: "4",
};

// 저축 카테고리 반복거래만 상품을 보낸다 — 카테고리를 바꾼 뒤 남은 상품 id가 따라가면 서버가 400을 낸다.
describe("buildRecurringPayload", () => {
  it("sends the savings product for a savings-category expense", () => {
    expect(buildRecurringPayload(base, categories).savings_product_id).toBe(4);
  });

  it("drops the product when the category is not a savings category", () => {
    expect(buildRecurringPayload({ ...base, category_id: "1" }, categories).savings_product_id).toBeNull();
  });

  it("sends null when no product is chosen", () => {
    expect(buildRecurringPayload({ ...base, savings_product_id: "" }, categories).savings_product_id).toBeNull();
  });
});

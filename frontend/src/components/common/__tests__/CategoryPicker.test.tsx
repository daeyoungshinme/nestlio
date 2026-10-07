import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CategoryPicker from "@/components/common/CategoryPicker";
import type { CategoryOut } from "@/types";

const categories = [
  { id: 1, name: "식비", kind: "expense", type: "variable", color: "#000", icon: null, is_active: true, sort_order: 0 },
] as CategoryOut[];

// 레이블이 select와 연결돼 있어야 스크린리더가 이름을 읽는다 — 같은 화면에 여러 개 떠도 id가 겹치지 않아야 한다.
describe("CategoryPicker", () => {
  it("associates its label with the select, uniquely per instance", () => {
    render(
      <>
        <CategoryPicker categories={categories} value="" onChange={() => {}} label="지출 카테고리" />
        <CategoryPicker categories={categories} value="" onChange={() => {}} label="예산 카테고리" />
      </>,
    );
    const first = screen.getByLabelText("지출 카테고리");
    const second = screen.getByLabelText("예산 카테고리");
    expect(first.tagName).toBe("SELECT");
    expect(first.id).not.toBe(second.id);
  });
});

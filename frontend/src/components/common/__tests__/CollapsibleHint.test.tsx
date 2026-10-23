import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CollapsibleHint from "@/components/common/CollapsibleHint";

describe("CollapsibleHint", () => {
  // 모바일에선 한 줄 요약만 보이고 "자세히"로 나머지를 연다(sm 이상은 CSS로 항상 펼침).
  it("keeps the detail hidden on mobile until 자세히 is tapped", () => {
    render(<CollapsibleHint summary="한 줄 요약">긴 설명</CollapsibleHint>);
    const detail = screen.getByText("긴 설명");
    expect(detail).toHaveClass("hidden", "sm:block");

    fireEvent.click(screen.getByRole("button", { name: "자세히" }));
    expect(detail).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute("aria-expanded", "true");
  });
});

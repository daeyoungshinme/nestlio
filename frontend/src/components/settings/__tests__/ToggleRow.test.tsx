import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToggleRow } from "@/components/settings/shared";

describe("ToggleRow", () => {
  // 행 전체가 스위치라 16px 체크박스를 겨냥하지 않아도 된다 — 이름은 라벨, 설명은 힌트.
  it("is a labelled switch that flips on tap", () => {
    const onChange = vi.fn();
    render(<ToggleRow label="주간 요약" hint="매주 가계부 요약 이메일" checked={false} onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: /주간 요약/ });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAccessibleDescription("매주 가계부 요약 이메일");

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

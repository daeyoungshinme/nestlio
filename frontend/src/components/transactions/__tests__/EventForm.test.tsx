import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EventForm, { emptyEventFormValues } from "@/components/transactions/EventForm";

// 종료일만 고르고 시간을 비우면 "00:00"이 가서, 같은 날 오후 일정은 종료가 시작보다 앞섰다(백엔드가 422로 거부).
describe("EventForm end time", () => {
  it("uses the start time when the end time is left blank", () => {
    const onSubmit = vi.fn();
    render(
      <EventForm
        initialValues={{ ...emptyEventFormValues("2026-07-01"), title: "병원", start_time: "14:00", end_date: "2026-07-01" }}
        submitLabel="저장"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ start_at: "2026-07-01T14:00:00", end_at: "2026-07-01T14:00:00" }),
    );
  });
});

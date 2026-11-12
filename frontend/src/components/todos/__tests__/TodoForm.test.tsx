import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TodoForm from "@/components/todos/TodoForm";
import type { TodoOut, UserOut } from "@/types";

const spouse = { id: "u1", display_name: "배우자" } as UserOut;

function renderForm(todo?: TodoOut) {
  const onSubmit = vi.fn();
  render(<TodoForm todo={todo} submitLabel="저장" users={[spouse]} onSubmit={onSubmit} />);
  return onSubmit;
}

describe("TodoForm", () => {
  it("기한이 없으면 반복을 고를 수 없다", () => {
    renderForm();
    expect(screen.getByLabelText("반복")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("기한 (선택)"), { target: { value: "2026-07-10" } });
    expect(screen.getByLabelText("반복")).toBeEnabled();
  });

  it("기한을 지우면 반복도 해제되어 저장된다", () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText(/^할일/), { target: { value: "분리수거" } });
    fireEvent.change(screen.getByLabelText("기한 (선택)"), { target: { value: "2026-07-10" } });
    fireEvent.change(screen.getByLabelText("반복"), { target: { value: "weekly" } });
    fireEvent.change(screen.getByLabelText("기한 (선택)"), { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: "분리수거",
      memo: null,
      due_date: null,
      frequency: "once",
      assignee_id: null,
      each_completes: false,
    });
  });

  it("제목이 공백뿐이면 저장할 수 없다", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/^할일/), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it("담당자와 반복을 담아 저장한다", () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText(/^할일/), { target: { value: "세금 신고" } });
    fireEvent.change(screen.getByLabelText("담당자"), { target: { value: spouse.id } });
    fireEvent.change(screen.getByLabelText("기한 (선택)"), { target: { value: "2026-07-10" } });
    fireEvent.change(screen.getByLabelText("반복"), { target: { value: "yearly" } });

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: "세금 신고",
      memo: null,
      due_date: "2026-07-10",
      frequency: "yearly",
      assignee_id: spouse.id,
      each_completes: false,
    });
  });

  it("각자 완료는 공통 담당일 때만 켤 수 있고 담당자를 고르면 꺼진다", () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText(/^할일/), { target: { value: "건강검진" } });
    const each = screen.getByLabelText("각자 완료해야 해요");
    fireEvent.click(each);
    expect(each).toBeChecked();

    fireEvent.change(screen.getByLabelText("담당자"), { target: { value: spouse.id } });
    expect(each).not.toBeChecked();
    expect(each).toBeDisabled();

    fireEvent.change(screen.getByLabelText("담당자"), { target: { value: "" } });
    fireEvent.click(each);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ assignee_id: null, each_completes: true }));
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RowActionButtons from "@/components/common/RowActionButtons";

describe("RowActionButtons", () => {
  it("fires onEdit and onDelete handlers when both are provided", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<RowActionButtons onEdit={onEdit} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("omits the delete button when onDelete is not provided", () => {
    render(<RowActionButtons onEdit={vi.fn()} />);

    expect(screen.getByRole("button", { name: "수정" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  });

  it("omits the edit button when onEdit is not provided", () => {
    render(<RowActionButtons onDelete={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "수정" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
  });
});

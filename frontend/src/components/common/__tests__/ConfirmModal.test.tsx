import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConfirmModal from "@/components/common/ConfirmModal";
import Modal from "@/components/common/Modal";

describe("ConfirmModal", () => {
  it("closes on Escape and focuses the cancel button first", () => {
    const onCancel = vi.fn();
    render(<ConfirmModal message="삭제할까요?" onConfirm={vi.fn()} onCancel={onCancel} />);

    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("closes only the topmost dialog when stacked over a Modal", () => {
    const onModalClose = vi.fn();
    const onCancel = vi.fn();
    render(
      <Modal onClose={onModalClose} title="내역">
        <ConfirmModal message="삭제할까요?" onConfirm={vi.fn()} onCancel={onCancel} />
      </Modal>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onModalClose).not.toHaveBeenCalled();
  });
});

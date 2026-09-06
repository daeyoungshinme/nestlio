import { AlertTriangle } from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";
import { TOUCH_TARGET_MIN } from "@/constants/uiSizes";
import { Z_CONFIRM_MODAL } from "@/constants/zIndex";

interface Props {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  /** 타이핑 확인 등 추가 조건을 만족하기 전까지 확인 버튼을 잠글 때 사용한다. */
  confirmDisabled?: boolean;
  children?: ReactNode;
}

export default function ConfirmModal({
  message,
  confirmLabel = "확인",
  cancelLabel = "취소",
  onConfirm,
  onCancel,
  danger = true,
  confirmDisabled = false,
  children,
}: Props) {
  const msgId = useId();

  return (
    <div
      className={`fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center ${Z_CONFIRM_MODAL} sm:p-4`}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={msgId}
        className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-5">
          {danger && (
            <AlertTriangle size={20} className="text-red-500 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p id={msgId} className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
              {message}
            </p>
            {children}
          </div>
        </div>
        <div className="flex gap-4 justify-end">
          <button
            onClick={onCancel}
            className={`${TOUCH_TARGET_MIN} px-4 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`${TOUCH_TARGET_MIN} px-4 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              danger ? "bg-red-600 text-white hover:bg-red-700" : "bg-primary text-white hover:bg-primary-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

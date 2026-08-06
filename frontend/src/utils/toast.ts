export type ToastType = "error" | "success" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastEvent {
  message: string;
  type: ToastType;
  id: number;
  action?: ToastAction;
}

let _seq = 0;

export function toast(message: string, type: ToastType = "error", action?: ToastAction) {
  window.dispatchEvent(
    new CustomEvent<ToastEvent>("nestlio:toast", {
      detail: { message, type, id: ++_seq, action },
    }),
  );
}

/** 앱 전역 z-index 중앙 상수화. 값 자체는 기존 하드코딩(30/50/50/60/70)을 그대로 유지하며,
 * 쌓임 순서(FAB < BottomNav ≈ Toaster < Modal < ConfirmModal)만 한곳에서 관리한다. */
export const Z_FAB = "z-30";
export const Z_BOTTOM_NAV = "z-50";
export const Z_TOASTER = "z-50";
export const Z_MODAL = "z-[60]";
export const Z_CONFIRM_MODAL = "z-[70]";

/** 앱 전역 z-index 중앙 상수화. 쌓임 순서(FAB < BottomNav < Modal < ConfirmModal < Toaster)를
 * 한곳에서 관리한다. Toaster가 맨 위인 이유: 모달 안에서 저장한 직후의 "취소"(undo) 토스트와
 * 폼 에러 토스트가 모달 backdrop 아래에 깔려 보이지도 눌리지도 않던 문제를 막는다. */
export const Z_FAB = "z-30";
export const Z_BOTTOM_NAV = "z-50";
export const Z_MODAL = "z-[60]";
export const Z_CONFIRM_MODAL = "z-[70]";
export const Z_TOASTER = "z-[80]";

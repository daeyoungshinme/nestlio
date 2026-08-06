export const TOUCH_TARGET_MIN = "min-h-[44px] min-w-[44px] flex items-center justify-center";
export const TOUCH_TARGET_MIN_MOBILE_ONLY =
  "min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center";
export const TOUCH_TARGET_ROW = "min-h-[44px] min-w-[44px] flex items-center justify-start";
/** 배지/탭/필터 칩처럼 조밀하게 나열되는 보조 요소용 절충 터치 타겟(36px, WCAG AA 24px 이상 + 컴팩트한 칩 톤 유지).
 * 단독으로 배치되는 명확한 액션 버튼(수정/삭제/닫기 등)에는 TOUCH_TARGET_MIN_MOBILE_ONLY(44px)를 우선 사용. */
export const TOUCH_TARGET_COMPACT_MOBILE_ONLY =
  "min-h-9 min-w-9 sm:min-h-0 sm:min-w-0 flex items-center justify-center";
/** 가계부 캘린더 셀(LedgerDayCell) 최소 높이 — MonthCalendarGrid의 CSS Grid 행이
 * 셀 하나의 높이에 맞춰 전체 행이 늘어나므로 여러 파일에서 동일 값을 참조할 때 이 상수를 쓴다. */
export const LEDGER_DAY_CELL_MIN_HEIGHT = "min-h-16 sm:min-h-24 lg:min-h-28";
/** BottomNav 실측 높이(모바일, safe-area 제외, px 단위) — QuickAddFab처럼 BottomNav 위에
 * 떠야 하는 요소가 이 값을 기준으로 위치를 계산한다. BottomNav 레이아웃(py-3 + 아이콘 22px + 라벨)이
 * 바뀌면 이 값만 갱신하면 된다. */
export const BOTTOM_NAV_HEIGHT_PX = 64;
/** flex 방향(row/col)이 이미 다른 클래스로 정해져 있어 TOUCH_TARGET_MIN(row 전제)을 그대로
 * 쓸 수 없을 때, 최소 높이만 명시적으로 강제하고 싶은 경우 사용 (예: BottomNav의 세로 flex 항목). */
export const TOUCH_TARGET_MIN_HEIGHT = "min-h-[44px]";

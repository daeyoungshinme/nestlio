/** 로컬 시간대 기준 날짜 헬퍼. `new Date().toISOString()`은 UTC라 KST 00:00~09:00에 하루가
 * 밀리므로(거래 기본 날짜 등에서 버그), 여기 헬퍼는 전부 `getFullYear/getMonth/getDate`를 쓴다.
 * 예전엔 이 함수들이 6~7개 파일에 복붙돼 있었다 — 새 날짜 계산은 여기 추가한다. */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date -> "YYYY-MM-DD" (로컬 시간 기준) */
export function toDateIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 오늘 날짜 "YYYY-MM-DD" (로컬). */
export function currentDateIso(): string {
  const d = new Date();
  return toDateIso(d);
}

/** 이번 달 "YYYY-MM" (로컬). */
export function currentYearMonth(): string {
  return yearMonthOfDate(new Date());
}

/** Date → 'YYYY-MM' (로컬). 렌더 중 고정해 둔 시각(useState(() => new Date()))에서 달을 뽑을 때 쓴다. */
export function yearMonthOfDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** 올해 연도 (로컬). */
export function currentYear(): number {
  return new Date().getFullYear();
}

/** "YYYY-MM-DD"에 일 수를 더한 "YYYY-MM-DD" (월/연 경계 넘어감). */
export function shiftDateIso(dateIso: string, deltaDays: number): string {
  const [y, m, day] = dateIso.split("-").map(Number);
  const d = new Date(y, m - 1, day + deltaDays);
  return toDateIso(d);
}

/** "YYYY-MM" 또는 "YYYY-MM-DD"에서 연도(number). `Number(s.slice(0, 4))`를 손으로 쓰지 않는다. */
export function yearOf(yearMonthOrDate: string): number {
  return Number(yearMonthOrDate.slice(0, 4));
}

/** "YYYY-MM"에 개월 수를 더한 "YYYY-MM". */
export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** "YYYY-MM" → 그 달의 시작/끝 날짜(양끝 포함). 거래·일정 목록 조회 파라미터에 쓴다. */
export function monthBounds(yearMonth: string): { date_from: string; date_to: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { date_from: `${yearMonth}-01`, date_to: `${yearMonth}-${pad2(lastDay)}` };
}

/** 서버가 주는 날짜/일시("...T..." 가능)에서 날짜 부분만. */
export function occurrenceDate(iso: string): string {
  return iso.split("T")[0];
}

/** 일요일부터 시작하는 요일 라벨(Date#getDay 인덱스와 같은 순서). */
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "YYYY-MM-DD" → "M.D (요일)" — 가계부·일정의 날짜별 접이식 목록 헤더. */
export function formatDayHeader(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return `${m}.${d} (${WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()]})`;
}

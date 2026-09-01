/** 로컬 시간대 기준 날짜 헬퍼. `new Date().toISOString()`은 UTC라 KST 00:00~09:00에 하루가
 * 밀리므로(거래 기본 날짜 등에서 버그), 여기 헬퍼는 전부 `getFullYear/getMonth/getDate`를 쓴다.
 * 예전엔 이 함수들이 6~7개 파일에 복붙돼 있었다 — 새 날짜 계산은 여기 추가한다. */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 오늘 날짜 "YYYY-MM-DD" (로컬). */
export function currentDateIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 이번 달 "YYYY-MM" (로컬). */
export function currentYearMonth(): string {
  const d = new Date();
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
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

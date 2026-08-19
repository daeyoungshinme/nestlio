const KRW_FORMATTER = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

/** "12345.00" | 12345 | null -> "12,345원" */
export function formatKrw(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "0원";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "0원";
  return `${KRW_FORMATTER.format(n)}원`;
}

/** "12345.00" | 12345 -> "12,345" (통화 단위 없이) */
export function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "0";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "0";
  return KRW_FORMATTER.format(n);
}

/** 억원/만원 단위 축약 표기. 예: 150_000_000 -> "1.50억원", 5_000_000 -> "500만원", 3_000 -> "3,000원" */
export function formatKrwCompact(n: number): string {
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)}억원`;
  if (Math.abs(n) >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만원`;
  return `${KRW_FORMATTER.format(Math.floor(n))}원`;
}

/**
 * 입력 중인 금액 프리뷰: 콤마 exact 값 + (억/만원 축약) 병기.
 * 예: 5_000_000 -> "5,000,000원 (500만원)", 3_000 -> "3,000원"
 */
export function formatKrwPreview(n: number): string {
  const exact = `${KRW_FORMATTER.format(Math.floor(n))}원`;
  if (Math.abs(n) < 1e4) return exact;
  return `${exact} (${formatKrwCompact(n)})`;
}

/** Decimal 문자열("500000.00")을 number input value용 정수 문자열로 정규화. KRW 전제라 소수점 제거 */
export function toAmountInputValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "0";
  return String(n);
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

/** 백엔드 app/utils/plan_status.py::pct_of와 동일한 규칙 — 계획(planned)이 0이어도 실적이 있으면
 * 0%/null이 아니라 100%로 간주한다("목표 없이 썼다/모았다"). 여러 그룹의 planned/actual을 합산해
 * 통합 pct를 만드는 화면(예: 저축·투자 = savings + investment)에서 백엔드와 어긋나지 않도록 쓴다. */
export function pctOf(actual: number | null, planned: number, cap = 999): number | null {
  if (actual === null) return null;
  if (planned > 0) return Math.min((actual / planned) * 100, cap);
  if (actual !== 0) return 100;
  return null;
}

/** "2026-07-01" -> "2026.07.01" */
export function formatDate(isoDate: string): string {
  return isoDate.replaceAll("-", ".");
}

/** "2026-07" -> "2026년 7월" */
export function formatYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  return `${year}년 ${Number(month)}월`;
}

/** "2026-07-28", "2026-08-03" -> "7/28 - 8/3" */
export function formatWeekRange(mondayIso: string, sundayIso: string): string {
  const [, m1, d1] = mondayIso.split("-").map(Number);
  const [, m2, d2] = sundayIso.split("-").map(Number);
  return `${m1}/${d1} - ${m2}/${d2}`;
}

/** growlio 연동 항목의 "마지막 동기화" 타임스탬프 표시. 예: "2026-08-11T09:00:00" -> "8/11 09:00" */
export function formatSyncedAt(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

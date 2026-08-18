/** 상태/심각도별 Tailwind 색상 매핑을 한 곳에 모아둔다 - 컴포넌트에서 조건부 색상 클래스를
 * 직접 작성하지 않고 항상 이 유틸을 통해서만 가져온다 (growlio의 utils/colors.ts 컨벤션과 동일). */

export type InsightSeverity = "info" | "warning" | "critical";

const INSIGHT_SEVERITY_STYLE: Record<InsightSeverity, string> = {
  info: "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  warning:
    "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  critical: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
};

export function insightSeverityStyle(severity: InsightSeverity): string {
  return INSIGHT_SEVERITY_STYLE[severity];
}

const CATEGORY_TYPE_STYLE: Record<"fixed" | "variable" | "irregular", string> = {
  fixed: "bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400",
  variable: "bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400",
  irregular: "bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400",
};

export function categoryTypeBadgeStyle(type: "fixed" | "variable" | "irregular"): string {
  return CATEGORY_TYPE_STYLE[type];
}

const TRANSACTION_TYPE_STYLE: Record<"income" | "expense", string> = {
  income: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400",
  expense: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
};

export function transactionTypeBadgeStyle(type: "income" | "expense"): string {
  return TRANSACTION_TYPE_STYLE[type];
}

const TRANSACTION_AMOUNT_TEXT: Record<"income" | "expense", string> = {
  income: "text-emerald-600 dark:text-emerald-400",
  expense: "text-gray-700 dark:text-gray-300",
};

export function transactionAmountTextColor(type: "income" | "expense"): string {
  return TRANSACTION_AMOUNT_TEXT[type];
}

export type PlanStatus = "ok" | "warn" | "critical";

const PLAN_STATUS_BAR: Record<PlanStatus, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  critical: "bg-red-500",
};

const PLAN_STATUS_TEXT: Record<PlanStatus, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
};

export function planStatusBarClass(status: PlanStatus): string {
  return PLAN_STATUS_BAR[status];
}

export function planStatusTextClass(status: PlanStatus): string {
  return PLAN_STATUS_TEXT[status];
}

const PLAN_STATUS_PRIORITY: Record<PlanStatus, number> = { ok: 0, warn: 1, critical: 2 };

/** 두 PlanStatus 중 더 심각한 쪽을 고른다 — 저축/투자처럼 두 그룹의 상태를 하나로 합쳐 보여줄 때
 * 쓴다(GoalPurposeSummary가 이번 달/연간 뷰 양쪽에서 공유). null은 "아직 계산 불가"로 취급해
 * 상대편 값을 그대로 반환한다. */
export function worseStatus(a: PlanStatus | null, b: PlanStatus | null): PlanStatus | null {
  if (a === null) return b;
  if (b === null) return a;
  return PLAN_STATUS_PRIORITY[a] >= PLAN_STATUS_PRIORITY[b] ? a : b;
}

export type SavingsProductType = "savings" | "investment" | "real_estate" | "emergency_fund";

const SAVINGS_PRODUCT_TYPE_BADGE_STYLE: Record<SavingsProductType, string> = {
  savings: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400",
  investment: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400",
  real_estate: "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400",
  emergency_fund: "bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400",
};

const SAVINGS_PRODUCT_TYPE_DOT: Record<SavingsProductType, string> = {
  savings: "bg-emerald-500",
  investment: "bg-blue-500",
  real_estate: "bg-amber-500",
  emergency_fund: "bg-rose-500",
};

const SAVINGS_PRODUCT_TYPE_LABEL: Record<SavingsProductType, string> = {
  savings: "저축",
  investment: "투자",
  real_estate: "부동산",
  emergency_fund: "비상금",
};

export function savingsProductTypeBadgeStyle(type: SavingsProductType): string {
  return SAVINGS_PRODUCT_TYPE_BADGE_STYLE[type];
}

export function savingsProductTypeDotClass(type: SavingsProductType | undefined): string {
  return type ? SAVINGS_PRODUCT_TYPE_DOT[type] : "bg-gray-400 dark:bg-gray-600";
}

export function savingsProductTypeLabel(type: SavingsProductType): string {
  return SAVINGS_PRODUCT_TYPE_LABEL[type];
}

export function returnRateTextColor(pct: number): string {
  if (pct > 0) return "text-red-600 dark:text-red-400";
  if (pct < 0) return "text-blue-600 dark:text-blue-400";
  return "text-gray-500 dark:text-gray-400";
}

export function netWorthTextColor(netWorth: number): string {
  return netWorth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

export type InviteStatus = "pending" | "accepted" | "expired";

const INVITE_STATUS_TEXT: Record<InviteStatus, string> = {
  pending: "text-blue-600 dark:text-blue-400",
  accepted: "text-emerald-600 dark:text-emerald-400",
  expired: "text-gray-400 dark:text-gray-500",
};

const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  pending: "대기중",
  accepted: "수락됨",
  expired: "만료됨",
};

export function inviteStatusTextClass(status: InviteStatus): string {
  return INVITE_STATUS_TEXT[status];
}

export function inviteStatusLabel(status: InviteStatus): string {
  return INVITE_STATUS_LABEL[status];
}

export type ConnectionStatus = "connected" | "disconnected";

const CONNECTION_STATUS_BADGE: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  disconnected: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
};

const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "연결됨",
  disconnected: "연결 안 됨",
};

export function connectionStatusBadgeClass(status: ConnectionStatus): string {
  return CONNECTION_STATUS_BADGE[status];
}

export function connectionStatusLabel(status: ConnectionStatus): string {
  return CONNECTION_STATUS_LABEL[status];
}

/** 재무목표/챌린지가 공유하는 진행 상태 배지 타입 — 두 리소스가 각자 손으로 구현하던
 * 배지 색상표(구 challengeStatusBadgeClass 등)를 하나로 합친 것. 목표는 goalStatus.ts가,
 * 챌린지는 각 컴포넌트가 자신의 status 값을 이 타입으로 매핑해 재사용한다. */
export type ProgressStatus = "on_track" | "behind" | "achieved" | "expired" | "neutral";

const PROGRESS_STATUS_BADGE: Record<ProgressStatus, string> = {
  on_track: "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
  behind: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
  achieved: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  expired: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  neutral: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
};

const PROGRESS_STATUS_LABEL: Record<ProgressStatus, string> = {
  on_track: "정상",
  behind: "지연",
  achieved: "달성",
  expired: "기간종료",
  neutral: "진행중",
};

export function progressStatusBadgeClass(status: ProgressStatus): string {
  return PROGRESS_STATUS_BADGE[status];
}

export function progressStatusLabel(status: ProgressStatus): string {
  return PROGRESS_STATUS_LABEL[status];
}

export type AssetCategory = "accounts" | "savings_investment" | "real_estate";

/** 자산현황 도넛(계좌/저축·투자/부동산 구성비) 전용 팔레트. 파이 조각이 서로 모두 인접하는
 * all-pairs 형태라 dataviz 스킬 검증 스크립트로 라이트/다크 모두 CVD·명도 기준 통과를 확인한
 * 조합(라이트 모드 부동산 슬라이스만 배경 대비 WARN)이다 — 색만으로 구분하지 않도록
 * AssetCompositionDonut은 항상 텍스트 범례를 함께 그린다. 대출은 파이 슬라이스(같은 부호끼리의
 * 부분-전체 비교)에 넣지 않는다 — 자산(+)과 부채를 같은 도넛에 양수 조각으로 섞으면 대출도
 * 자산의 일부처럼 읽히는 오독이 생긴다(실제로 겪은 문제). 대출은 AssetCompositionDonut 범례에도
 * 넣지 않고, AccountsSnapshotCard가 순자산 아래 "총자산 − 대출 = 순자산" 계산식 텍스트로 별도
 * 표시한다. savings/investment 저축상품 배지 색(SAVINGS_PRODUCT_TYPE_*)과는 다른 축(자산
 * "대분류" vs 저축상품 "세부 유형")이라 의도적으로 별개 팔레트를 쓴다. */
const ASSET_CATEGORY_CHART_COLOR: Record<AssetCategory, { light: string; dark: string }> = {
  accounts: { light: "#2a78d6", dark: "#3987e5" },
  savings_investment: { light: "#eb6834", dark: "#d95926" },
  real_estate: { light: "#1baf7a", dark: "#199e70" },
};

export function assetCategoryChartColor(category: AssetCategory, isDark: boolean): string {
  return ASSET_CATEGORY_CHART_COLOR[category][isDark ? "dark" : "light"];
}

const NET_WORTH_TREND_CHART_COLOR = { light: "#2563EB", dark: "#60a5fa" };

/** 순자산 추이 차트(NetWorthTrendChart) 전용 단색 라인/그라디언트 색상. 어두운 배경에서
 * 대비가 낮아지는 라이트용 블루 대신 dark 모드에서는 더 밝은 톤(blue-400)을 쓴다. */
export function netWorthTrendChartColor(isDark: boolean): string {
  return NET_WORTH_TREND_CHART_COLOR[isDark ? "dark" : "light"];
}

export function growlioLinkedBadgeStyle(): string {
  return "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300";
}

export function googleImportedEventBadgeStyle(): string {
  return "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400";
}

export function linkedGoalBadgeStyle(): string {
  return "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300";
}

const RECURRING_LINK_BADGE_STYLE: Record<"active" | "inactive", string> = {
  active: "bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400",
  inactive: "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500",
};

const RECURRING_LINK_BADGE_LABEL: Record<"active" | "inactive", string> = {
  active: "자동 반영 중",
  inactive: "반복내역 비활성",
};

export function recurringLinkBadgeStyle(active: boolean): string {
  return RECURRING_LINK_BADGE_STYLE[active ? "active" : "inactive"];
}

export function recurringLinkBadgeLabel(active: boolean): string {
  return RECURRING_LINK_BADGE_LABEL[active ? "active" : "inactive"];
}

/** FormInput의 에러 상태 테두리(에러 시 input에 덧씌우는 border+focus ring). */
export function formErrorBorderClass(): string {
  return "border-red-400 dark:border-red-500 focus:ring-red-400";
}

/** FormInput의 에러 메시지 텍스트 색상. */
export function formErrorTextClass(): string {
  return "text-red-500";
}

/** FormInput의 실시간 프리뷰(정보성) 텍스트 색상. */
export function formPreviewTextClass(): string {
  return "text-blue-600 dark:text-blue-400";
}

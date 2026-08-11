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

export type SavingsProductType = "savings" | "investment" | "real_estate";

const SAVINGS_PRODUCT_TYPE_BADGE_STYLE: Record<SavingsProductType, string> = {
  savings: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400",
  investment: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400",
  real_estate: "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400",
};

const SAVINGS_PRODUCT_TYPE_DOT: Record<SavingsProductType, string> = {
  savings: "bg-emerald-500",
  investment: "bg-blue-500",
  real_estate: "bg-amber-500",
};

const SAVINGS_PRODUCT_TYPE_LABEL: Record<SavingsProductType, string> = {
  savings: "저축",
  investment: "투자",
  real_estate: "부동산",
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

/** 재무목표 카드의 "연동" 배지(연동된 저축/투자/계좌 안내) 색상 — 인라인 Tailwind 리터럴
 * 대신 이 유틸을 거치도록 뽑아냈다. */
export function fundingLinkBadgeStyle(): string {
  return "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300";
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

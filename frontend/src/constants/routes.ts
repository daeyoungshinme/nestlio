/** 앱 라우트 경로와 딥링크 조립 헬퍼의 단일 소스. 컴포넌트에 `"/plan?view=이번 달"`
 * 같은 문자열을 직접 쓰지 않는다 — 오타·정규화 드리프트(LegacyFinancialPlanRedirect 참고) 방지. */

export const ROUTES = {
  dashboard: "/",
  transactions: "/transactions",
  transactionImport: "/transactions/import",
  /** 부부 일정 — 독립 페이지였다가 가계부의 "일정" 보기로 병합됐다. 구 `/schedule` 경로는 리다이렉트만 남는다. */
  schedule: "/transactions?view=일정",
  categories: "/categories",
  accounts: "/accounts",
  plan: "/plan",
  goals: "/goals",
  settings: "/settings",
  login: "/login",
  inviteAccept: "/invite/accept",
  authCallback: "/auth/callback",
} as const;

/** `/transactions`의 세그먼트(`?view=`) — 캘린더는 공유하고 아래 목록만 바뀐다. */
export const LEDGER_VIEWS = ["내역", "일정"] as const;
export type LedgerView = (typeof LEDGER_VIEWS)[number];

/** `/plan`의 세그먼트(`?view=`). PlanPage가 이 값을 그대로 탭 라벨로 쓴다. */
export const PLAN_VIEWS = ["이번 달", "연간"] as const;
export type PlanView = (typeof PLAN_VIEWS)[number];

export function planViewLink(view: PlanView): string {
  return `${ROUTES.plan}?view=${view}`;
}

/** 계획 › 연간 하단 "실적 분석"(구 연간리포트 `/reports/yearly`) 앵커. AnnualPlanPanel이 `section=분석`을 보고 스크롤한다. */
export const PLAN_ANALYSIS_SECTION = "분석";

export function planAnalysisLink(): string {
  return `${planViewLink("연간")}&section=${PLAN_ANALYSIS_SECTION}`;
}

/** 가계부의 반복 내역 관리 시트를 바로 여는 딥링크 — useRecurringDeepLink가 `recurring=manage`를 소비한다. */
export function recurringManageLink(): string {
  return `${ROUTES.transactions}?recurring=manage`;
}

export function goalDetailLink(goalId: number): string {
  return `${ROUTES.goals}/${goalId}`;
}

/** `/accounts`의 접이식 섹션(`?section=`). AccountsPage가 이 값을 그대로 섹션 제목으로 쓴다. */
export const ACCOUNTS_SECTIONS = ["계좌", "저축·투자", "부동산", "대출"] as const;
export type AccountsSection = (typeof ACCOUNTS_SECTIONS)[number];

export function accountsSectionLink(section: AccountsSection): string {
  return `${ROUTES.accounts}?section=${section}`;
}

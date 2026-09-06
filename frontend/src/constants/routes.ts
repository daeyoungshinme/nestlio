/** 앱 라우트 경로와 딥링크 조립 헬퍼의 단일 소스. 컴포넌트에 `"/financial-plan?view=이번 달"`
 * 같은 문자열을 직접 쓰지 않는다 — 오타·정규화 드리프트(FinancialPlanPage.legacyView 참고) 방지. */

export const ROUTES = {
  dashboard: "/",
  transactions: "/transactions",
  transactionImport: "/transactions/import",
  schedule: "/schedule",
  categories: "/categories",
  accounts: "/accounts",
  reportsYearly: "/reports/yearly",
  financialPlan: "/financial-plan",
  settings: "/settings",
  login: "/login",
  inviteAccept: "/invite/accept",
  authCallback: "/auth/callback",
} as const;

/** `/financial-plan`의 세그먼트(`?view=`). FinancialPlanPage가 이 값을 그대로 탭 라벨로 쓴다. */
export const PLAN_VIEWS = ["목표", "이번 달", "연간"] as const;
export type PlanView = (typeof PLAN_VIEWS)[number];

export function planViewLink(view: PlanView): string {
  return `${ROUTES.financialPlan}?view=${view}`;
}

/** `/accounts`의 접이식 섹션(`?section=`). AccountsPage가 이 값을 그대로 섹션 제목으로 쓴다. */
export const ACCOUNTS_SECTIONS = ["계좌", "저축·투자", "부동산", "대출"] as const;
export type AccountsSection = (typeof ACCOUNTS_SECTIONS)[number];

export function accountsSectionLink(section: AccountsSection): string {
  return `${ROUTES.accounts}?section=${section}`;
}

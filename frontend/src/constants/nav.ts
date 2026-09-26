import { CalendarDays, ClipboardList, Home, Landmark, Target, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ROUTES } from "@/constants/routes";

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

export interface NavGroup {
  header: string | null;
  items: NavItem[];
}

const DASHBOARD: NavItem = { to: ROUTES.dashboard, icon: Home, label: "홈" };
const TRANSACTIONS: NavItem = { to: ROUTES.transactions, icon: Wallet, label: "가계부" };
const PLAN: NavItem = { to: ROUTES.plan, icon: ClipboardList, label: "계획" };
const GOALS: NavItem = { to: ROUTES.goals, icon: Target, label: "목표" };
const ACCOUNTS: NavItem = { to: ROUTES.accounts, icon: Landmark, label: "자산" };
const SCHEDULE: NavItem = { to: ROUTES.schedule, icon: CalendarDays, label: "일정" };

/** 하단 탭(모바일)과 사이드바(데스크톱)가 공유하는 주 메뉴 5개. 앱의 목적("부부가 연간 계획을 세우고
 * 월별로 점검하며 가계부를 함께 써서 자산증식 목표를 달성")을 그대로 따라간다:
 *   홈(요약) → 가계부(기록) → 계획(연간 원본 + 이번 달 조정) → 목표(동기부여) → 자산(순자산·growlio).
 * 목표를 계획에서 독립 탭으로 분리해 "우리가 어디까지 왔는지"를 한 번의 탭으로 보게 했다.
 * 설정은 탭이 아니라 헤더 아이콘(Header.tsx)으로 들어간다 — 사용 빈도가 낮아 탭 한 칸을 줄 이유가 없다.
 * "더보기" 시트는 없앴다(숨은 메뉴는 부부가 발견하지 못한다). */
export const PRIMARY_NAV_ITEMS: NavItem[] = [DASHBOARD, TRANSACTIONS, PLAN, GOALS, ACCOUNTS];

/** 데스크톱 사이드바 전용 보조 메뉴. 일정은 가계부 캘린더로 병합될 예정이라 모바일 하단탭에는 두지 않고
 * (가계부 헤더의 링크로 진입), 넓은 화면에서만 바로가기로 남긴다. 연간리포트는 계획 › 연간 › 실적 분석으로 흡수됐다. */
export const SECONDARY_NAV_ITEMS: NavItem[] = [SCHEDULE];

export const SIDEBAR_NAV_GROUPS: NavGroup[] = [
  { header: null, items: PRIMARY_NAV_ITEMS },
  { header: "바로가기", items: SECONDARY_NAV_ITEMS },
];

/** 헤더 페이지 타이틀 조회용 — 주/보조 메뉴 외에 헤더 아이콘·설정 하위로만 들어가는 화면까지 포함한다. */
export const PAGE_TITLES: { to: string; label: string }[] = [
  ...PRIMARY_NAV_ITEMS,
  ...SECONDARY_NAV_ITEMS,
  { to: ROUTES.settings, label: "설정" },
  { to: ROUTES.categories, label: "카테고리" },
  { to: ROUTES.transactionImport, label: "거래 데이터" },
];

/** 현재 경로에 대응하는 페이지 타이틀. 가장 긴 prefix가 이긴다(`/transactions/import` > `/transactions`). */
export function pageTitleFor(pathname: string): string | undefined {
  if (pathname === ROUTES.dashboard) return DASHBOARD.label;
  return PAGE_TITLES.filter((item) => item.to !== ROUTES.dashboard && pathname.startsWith(item.to)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0]?.label;
}

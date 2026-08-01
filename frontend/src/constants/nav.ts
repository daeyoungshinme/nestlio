import { BarChart3, Home, Landmark, Settings, Target, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

export interface NavGroup {
  header: string | null;
  items: NavItem[];
}

const DASHBOARD: NavItem = { to: "/", icon: Home, label: "대시보드" };
const TRANSACTIONS: NavItem = { to: "/transactions", icon: Wallet, label: "가계부" };
const ACCOUNTS: NavItem = { to: "/accounts", icon: Landmark, label: "자산현황" };
const REPORTS_YEARLY: NavItem = { to: "/reports/yearly", icon: BarChart3, label: "연간리포트" };
const FINANCIAL_PLAN: NavItem = { to: "/financial-plan", icon: Target, label: "목표" };
const SETTINGS: NavItem = { to: "/settings", icon: Settings, label: "설정" };

/** 사이드바(데스크톱, lg 이상)는 아래 그룹을 순서대로 전부 보여준다. 대시보드/설정은
 * 그룹 헤더 없이 상단/하단에 단독으로 둔다. 일정은 가계부(/transactions) 캘린더에 통합됐고,
 * 예산·고정지출은 관리 화면 자체가 없어지고 가계부 페이지의 필터·거래 목록으로 흡수됐다
 * (구 라우트 `/budgets`, `/recurring`은 `/transactions`로 리다이렉트). */
export const SIDEBAR_NAV_GROUPS: NavGroup[] = [
  { header: null, items: [DASHBOARD] },
  { header: "지출관리", items: [TRANSACTIONS] },
  { header: "자산·목표", items: [ACCOUNTS, FINANCIAL_PLAN] },
  { header: "리포트", items: [REPORTS_YEARLY] },
  { header: null, items: [SETTINGS] },
];

/** SIDEBAR_NAV_GROUPS를 평탄화한 파생 목록 (총 6개). */
export const SIDEBAR_NAV_ITEMS: NavItem[] = SIDEBAR_NAV_GROUPS.flatMap((group) => group.items);

function byPaths(paths: string[]): NavItem[] {
  return paths.map((to) => {
    const item = SIDEBAR_NAV_ITEMS.find((candidate) => candidate.to === to);
    if (!item) throw new Error(`nav.ts: unknown path ${to}`);
    return item;
  });
}

/** 하단 탭(모바일)은 엄지 도달 범위/터치 타겟 크기를 지키기 위해 사용 빈도가 높은
 * 4개만 상시 노출하고, 나머지(연간리포트/설정)는 "더보기" 시트로 접는다. 예산·고정지출은
 * 관리 화면 자체가 없어지면서 별도 슬롯이 필요 없어져, 다음으로 자주 쓰는 자산현황을 그 자리에
 * 승격했다. 일정/예산/고정지출은 별도 탭이 아니라 가계부(/transactions) 페이지(월간 캘린더 +
 * 수입/지출·카테고리별 필터가 붙은 거래 목록)로 흡수됐다. */
export const BOTTOM_NAV_PRIMARY_ITEMS: NavItem[] = byPaths(["/", "/transactions", "/accounts", "/financial-plan"]);

export const BOTTOM_NAV_MORE_ITEMS: NavItem[] = byPaths(["/reports/yearly", "/settings"]);

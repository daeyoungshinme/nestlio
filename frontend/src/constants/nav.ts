import { BarChart3, CalendarDays, Home, Landmark, Settings, Target, Wallet } from "lucide-react";
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

const DASHBOARD: NavItem = { to: ROUTES.dashboard, icon: Home, label: "대시보드" };
const TRANSACTIONS: NavItem = { to: ROUTES.transactions, icon: Wallet, label: "가계부" };
const ACCOUNTS: NavItem = { to: ROUTES.accounts, icon: Landmark, label: "자산" };
const SCHEDULE: NavItem = { to: ROUTES.schedule, icon: CalendarDays, label: "일정" };
const REPORTS_YEARLY: NavItem = { to: ROUTES.reportsYearly, icon: BarChart3, label: "연간리포트" };
const FINANCIAL_PLAN: NavItem = { to: ROUTES.financialPlan, icon: Target, label: "계획·목표" };
const SETTINGS: NavItem = { to: ROUTES.settings, icon: Settings, label: "설정" };

/** 사이드바(데스크톱, lg 이상)는 아래 그룹을 순서대로 전부 보여준다. 대시보드/연간리포트/설정은
 * 그룹 헤더 없이 단독으로 둔다. 앱의 유일한 목적("부부가 세운 자산증식 목표 달성")을 중심으로
 * 위계를 납작하게 정리했다:
 *   - "기록"    = 매일 들어가는 실측 입력 (가계부 + 일정). 일정은 화면 자체는 `/schedule`로
 *                 독립돼 있지만(담당자 배분·완료 체크·전체 CRUD가 있는 부부 공동 플래너) 사용
 *                 빈도상 가계부와 한 그룹으로 묶고, 모바일 하단탭에서는 "더보기"에 접힌다.
 *   - "계획·목표"= `/financial-plan`(화면 내부 `[목표] [이번 달] [연간]` 세그먼트 — 구 페이지 탭
 *                 2 × 뷰 서브탭 2 × 섹션 탭 5의 3중 중첩을 평탄화)과 `/accounts`를 한 그룹으로 묶는다.
 *                 재무목표·현금흐름 계획은 스코프(목표일 vs 달력월)가 다르지만 커플이 여는 이유는 늘
 *                 "목표가 뭐고 이번 달 얼마"이고, 자산현황(순자산 스냅샷 + 계좌/저축·투자/부동산/대출
 *                 단일 스크롤, growlio 동기화·가져오기의 유일 진입점)도 그 판단 재료라 인접시켰다.
 * 예산·고정지출은 관리 화면 없이 가계부/계획 화면의 필터·섹션으로 흡수됐다(구 라우트
 * `/budgets`, `/recurring`은 `/transactions`로 리다이렉트). 거래 수정도 별도 페이지 없이
 * 가계부의 인라인 모달로 처리한다(구 `/transactions/:id/edit` 삭제). */
export const SIDEBAR_NAV_GROUPS: NavGroup[] = [
  { header: null, items: [DASHBOARD] },
  { header: "기록", items: [TRANSACTIONS, SCHEDULE] },
  { header: "계획·목표", items: [FINANCIAL_PLAN, ACCOUNTS] },
  { header: null, items: [REPORTS_YEARLY] },
  { header: null, items: [SETTINGS] },
];

/** SIDEBAR_NAV_GROUPS를 평탄화한 파생 목록 (총 7개). */
export const SIDEBAR_NAV_ITEMS: NavItem[] = SIDEBAR_NAV_GROUPS.flatMap((group) => group.items);

function byPaths(paths: string[]): NavItem[] {
  return paths.map((to) => {
    const item = SIDEBAR_NAV_ITEMS.find((candidate) => candidate.to === to);
    if (!item) throw new Error(`nav.ts: unknown path ${to}`);
    return item;
  });
}

/** 하단 탭(모바일)은 엄지 도달 범위/터치 타겟 크기를 지키기 위해 사용 빈도가 높은
 * 4개(대시보드/가계부/계획·목표/자산)만 상시 노출하고, 나머지(일정/연간리포트/설정)는
 * "더보기" 시트로 접는다. 목표 달성 루프의 중심축(계획·목표)을 자산보다 앞에 둔다. */
export const BOTTOM_NAV_PRIMARY_ITEMS: NavItem[] = byPaths([
  ROUTES.dashboard,
  ROUTES.transactions,
  ROUTES.financialPlan,
  ROUTES.accounts,
]);

export const BOTTOM_NAV_MORE_ITEMS: NavItem[] = byPaths([ROUTES.schedule, ROUTES.reportsYearly, ROUTES.settings]);

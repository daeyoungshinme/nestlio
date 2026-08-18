import type { CashflowSection } from "@/types";

/** 이번 달 계획(CashflowPlanTab)과 연간계획(AnnualPlanPanel)이 공유하는 섹션 탭 목록 —
 * 두 화면이 "완전히 동일한 UI/UX"여야 하므로 각자 따로 선언하면 드리프트가 날 위험이 있어
 * 한 곳으로 모았다. */
export const SECTIONS = [
  { key: "income", label: "수입" },
  { key: "fixed", label: "고정지출" },
  { key: "variable", label: "변동지출" },
  { key: "irregular", label: "비정기지출" },
] as const satisfies { key: CashflowSection; label: string }[];

export const SAVINGS_INVESTMENT_LABEL = "저축·투자" as const;

export type SectionLabel = (typeof SECTIONS)[number]["label"] | typeof SAVINGS_INVESTMENT_LABEL;

export const SECTION_LABELS = [...SECTIONS.map((s) => s.label), SAVINGS_INVESTMENT_LABEL] as SectionLabel[];

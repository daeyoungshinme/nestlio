import { useState } from "react";
import type { FormEvent } from "react";
import Modal from "@/components/common/Modal";
import Tabs from "@/components/common/Tabs";
import ChallengeGoalFields from "@/components/financialPlan/goalForm/ChallengeGoalFields";
import CombinedGoalFields from "@/components/financialPlan/goalForm/CombinedGoalFields";
import LongTermGoalFields, { GOAL_STEPS } from "@/components/financialPlan/goalForm/LongTermGoalFields";
import NetWorthGoalFields from "@/components/financialPlan/goalForm/NetWorthGoalFields";
import { fundingSourceOptions } from "@/components/financialPlan/goalForm/goalFormShared";
import {
  emptyChallengeDraft,
  emptyCombinedDraft,
  emptyNetWorthDraft,
  EMPTY_GOAL_DRAFT,
  type Draft,
} from "@/components/financialPlan/goalDraft";
import type { AccountWithBalanceOut, FinancialGoalOut, GoalKind, LoanOut, SavingsProductOut, UserOut } from "@/types";

const GOAL_KIND_TABS = ["통합", "순자산", "장기 목표", "챌린지"] as const;
type GoalKindTab = (typeof GOAL_KIND_TABS)[number];
const GOAL_KIND_TAB_TO_KIND: Record<GoalKindTab, GoalKind> = {
  통합: "combined",
  순자산: "net_worth",
  "장기 목표": "goal",
  챌린지: "challenge",
};
const KIND_TO_GOAL_KIND_TAB: Record<GoalKind, GoalKindTab> = {
  combined: "통합",
  net_worth: "순자산",
  goal: "장기 목표",
  challenge: "챌린지",
};

function emptyDraftFor(kind: GoalKind, userIds: string[]): Draft {
  if (kind === "challenge") return emptyChallengeDraft();
  if (kind === "net_worth") return emptyNetWorthDraft();
  if (kind === "combined") return emptyCombinedDraft(userIds);
  return EMPTY_GOAL_DRAFT;
}

/** 기본 이름이 있는 유형 — 유형을 바꿀 때 입력하던 이름 대신 새 유형의 기본 이름을 쓴다. */
const DEFAULT_NAMED_KINDS: GoalKind[] = ["net_worth", "combined"];

/** 목표 추가·수정 모달. 초안·유형 토글·저장 판정만 여기서 하고, 입력 화면은 유형별 컴포넌트(`goalForm/`)가 그린다 —
 * 장기 목표는 3단계, 챌린지·순자산·통합 목표는 한 화면. */
export default function GoalFormModal({
  initial,
  title,
  submitLabel,
  submitting,
  savingsProducts,
  accounts,
  loans,
  existingGoal,
  canCreateNetWorth = true,
  canCreateCombined = true,
  goals = [],
  users = [],
  onClose,
  onSubmit,
}: {
  initial: Draft;
  title: string;
  submitLabel: string;
  submitting: boolean;
  savingsProducts: SavingsProductOut[];
  accounts: AccountWithBalanceOut[];
  loans: LoanOut[];
  existingGoal: FinancialGoalOut | null;
  /** 순자산 목표는 가구당 하나 — 이미 있으면 새 목표 유형에서 뺀다(백엔드도 409). */
  canCreateNetWorth?: boolean;
  /** 통합 목표도 가구당 하나(백엔드 409). */
  canCreateCombined?: boolean;
  /** 통합 목표에 묶을 수 있는 장기 목표 후보(kind==="goal"만 쓴다). */
  goals?: FinancialGoalOut[];
  /** growlio 목표를 합산할 가구 구성원. */
  users?: UserOut[];
  onClose: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [step, setStep] = useState(0);
  // 렌더 중 new Date()는 비순수 호출이라(oxlint) 모달이 열린 시점을 한 번만 잡는다.
  const [openedAt] = useState(() => new Date());
  const { availableSavingsProducts, availableLoans } = fundingSourceOptions(savingsProducts, loans, existingGoal);
  const shared = { draft, setDraft, submitLabel, submitting };

  const kindTabs = GOAL_KIND_TABS.filter(
    (tab) => (tab !== "순자산" || canCreateNetWorth) && (tab !== "통합" || canCreateCombined),
  );
  // 유형 선택은 생성 시에만 가능하다(백엔드 FinancialGoalUpdateIn에 kind 필드 자체가 없어 생성 후
  // 유형 변경이 불가능) — 수정 모드에서는 토글을 숨기고 기존 kind별 폼만 보여준다. 이름은 유형을
  // 바꿔도 다시 입력하지 않도록 보존하고, 나머지 필드는 빈 초안으로 리셋한다(필드 구성이 크게 다름).
  const kindToggle =
    existingGoal === null ? (
      <Tabs
        tabs={kindTabs}
        activeTab={KIND_TO_GOAL_KIND_TAB[draft.kind]}
        onChange={(tab) => {
          const nextKind = GOAL_KIND_TAB_TO_KIND[tab];
          const next = emptyDraftFor(nextKind, users.map((u) => u.id));
          // 순자산·통합 목표는 기본 이름이 있어 그대로 두고, 그 밖에는 입력하던 이름을 보존한다.
          setDraft((d) => ({ ...next, name: DEFAULT_NAMED_KINDS.includes(d.kind) ? next.name : d.name || next.name }));
        }}
        variant="pill"
      />
    ) : null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) {
      setStep(0);
      return;
    }
    // 챌린지·순자산·통합 목표는 한 화면 폼이라 바로 저장. 장기 목표는 마지막 단계에서만 저장하고, 그 전 Enter/다음은 다음 단계로.
    if (draft.kind === "goal" && step !== GOAL_STEPS.length - 1) {
      setStep((current) => current + 1);
      return;
    }
    onSubmit(draft);
  };

  return (
    <Modal onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
        {kindToggle}
        {draft.kind === "combined" ? (
          <CombinedGoalFields {...shared} existingGoal={existingGoal} goals={goals} users={users} />
        ) : draft.kind === "net_worth" ? (
          <NetWorthGoalFields
            {...shared}
            savingsProducts={savingsProducts}
            availableSavingsProducts={availableSavingsProducts}
            loans={loans}
          />
        ) : draft.kind === "challenge" ? (
          <ChallengeGoalFields {...shared} isEditing={existingGoal !== null} />
        ) : (
          <LongTermGoalFields
            {...shared}
            step={step}
            setStep={setStep}
            existingGoal={existingGoal}
            availableSavingsProducts={availableSavingsProducts}
            accounts={accounts}
            availableLoans={availableLoans}
            openedAt={openedAt}
          />
        )}
      </form>
    </Modal>
  );
}

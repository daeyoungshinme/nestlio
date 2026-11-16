import type { Dispatch, SetStateAction } from "react";
import type { GoalFieldsProps } from "@/components/financialPlan/goalForm/goalFormShared";
import type { AccountWithBalanceOut, FinancialGoalOut, LoanOut, SavingsProductOut } from "@/types";

/** 장기 목표 폼(LongTermGoalFields)과 그 단계 컴포넌트들이 함께 받는 props. */
export type LongTermGoalFieldsProps = GoalFieldsProps & {
  step: number;
  setStep: Dispatch<SetStateAction<number>>;
  existingGoal: FinancialGoalOut | null;
  availableSavingsProducts: SavingsProductOut[];
  accounts: AccountWithBalanceOut[];
  availableLoans: LoanOut[];
  /** 모달이 열린 시점 — 렌더 중 new Date()는 비순수 호출이라(oxlint) 모달이 한 번만 잡아 넘긴다. */
  openedAt: Date;
};

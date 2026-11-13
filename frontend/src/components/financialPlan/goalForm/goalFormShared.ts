import type { Dispatch, SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import { fetchGrowlioGoalSettings } from "@/api/goals";
import { isGrowlioLinkedInvestment } from "@/constants/growlio";
import type { Draft } from "@/components/financialPlan/goalDraft";
import type { FinancialGoalOut, LoanOut, SavingsProductOut } from "@/types";
import { extractErrorMessage } from "@/utils/error";
import { realEstateMortgages } from "@/utils/netWorth";
import { toast } from "@/utils/toast";

export type SetDraft = Dispatch<SetStateAction<Draft>>;

/** 유형별 목표 폼이 공통으로 받는 값. */
export interface GoalFieldsProps {
  draft: Draft;
  setDraft: SetDraft;
  submitLabel: string;
  submitting: boolean;
}

type IdListField = "savings_product_ids" | "account_ids" | "loan_ids" | "member_goal_ids" | "growlio_user_ids";

/** 체크리스트 한 항목 토글 — 있으면 빼고 없으면 넣는다. */
export function toggleDraftId(setDraft: SetDraft, field: IdListField, id: string) {
  setDraft((d) => ({
    ...d,
    [field]: d[field].includes(id) ? d[field].filter((v) => v !== id) : [...d[field], id],
  }));
}

/** 목표 자금원 후보. 다른 목표에 이미 연동된 상품은 뺀다 — 연동되면 어느 목표를 따를지 모호해지기 때문.
 * 지금 이 목표에 이미 연동된 상품(existingGoal.id와 일치)은 계속 보여준다. 부동산과 그 짝 담보대출은 목표
 * 자금원이 될 수 없다(백엔드 goal_service.RealEstateFundingSourceError — 시세는 "모으는 돈"이 아니다). */
export function fundingSourceOptions(
  savingsProducts: SavingsProductOut[],
  loans: LoanOut[],
  existingGoal: FinancialGoalOut | null,
) {
  const availableSavingsProducts = savingsProducts.filter(
    (p) => p.product_type !== "real_estate" && (p.linked_goal_id === null || p.linked_goal_id === existingGoal?.id),
  );
  const mortgageIds = new Set(realEstateMortgages(savingsProducts, loans).map((loan) => loan.id));
  const availableLoans = loans.filter((loan) => !mortgageIds.has(loan.id));
  return { availableSavingsProducts, availableLoans };
}

/** "growlio 투자목표 불러오기" — growlio 목표금액·연 입금 목표·목표 수익률로 초안을 채운다. 저장 전에는 아무것도
 * 반영되지 않으므로(모달을 닫으면 원복) 확인 없이 바로 채운다. */
export function useGrowlioGoalImport(availableSavingsProducts: SavingsProductOut[], setDraft: SetDraft) {
  return useMutation({
    mutationFn: fetchGrowlioGoalSettings,
    onSuccess: (data) => {
      if (!data.is_configured || data.goal_amount === null) {
        toast("growlio에 설정된 투자목표가 없어요.", "error");
        return;
      }
      const goalAmount = data.goal_amount;
      const annualDepositGoal = data.annual_deposit_goal;
      // 다른 목표에 이미 연동된 상품은 후보에서 제외(fundingSourceOptions 참고).
      const growlioProductIds = availableSavingsProducts.filter(isGrowlioLinkedInvestment).map((p) => String(p.id));
      setDraft((d) => ({
        ...d,
        name: d.name.trim() === "" ? "growlio 투자목표" : d.name,
        required_amount: String(Math.round(goalAmount)),
        monthly_saving_amount:
          annualDepositGoal !== null
            ? String(Math.round(annualDepositGoal / 12))
            : d.monthly_saving_amount,
        savings_product_ids:
          d.kind !== "net_worth" && growlioProductIds.length > 0 ? growlioProductIds : d.savings_product_ids,
        // growlio 목표 수익률로 복리 ETA를 계산한다(목표 폼 3단계 "기대 연 수익률").
        expected_annual_return_pct:
          data.goal_annual_return_pct !== null ? String(data.goal_annual_return_pct) : d.expected_annual_return_pct,
      }));
      toast(
        growlioProductIds.length > 0
          ? "growlio 투자목표를 불러왔어요."
          : "growlio 투자목표를 불러왔어요. 저축·투자 상품 탭에서 growlio 계좌를 먼저 가져오면 진행률이 자동 반영돼요.",
        "success",
      );
    },
    onError: (err) => toast(extractErrorMessage(err, "growlio 투자목표를 불러오지 못했습니다."), "error"),
  });
}

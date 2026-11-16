import FundingSourceChecklist from "@/components/financialPlan/FundingSourceChecklist";
import { toggleDraftId } from "@/components/financialPlan/goalForm/goalFormShared";
import type { LongTermGoalFieldsProps } from "@/components/financialPlan/goalForm/longTermGoalTypes";
import { amountToneClass } from "@/utils/colors";
import { formatKrw } from "@/utils/format";

/** 장기 목표 2단계 — 연동할 저축/투자 상품·계좌·대출(선택). */
export default function LongTermFundingStep({ draft, setDraft, availableSavingsProducts, accounts, availableLoans }: LongTermGoalFieldsProps) {
  return (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        상품·계좌를 연결하면 저축액이 자동 계산돼요. 연결하지 않아도 돼요.
      </p>
      <FundingSourceChecklist
        label="연동할 저축/투자 상품 (복수 선택 가능)"
        items={availableSavingsProducts}
        getId={(p) => p.id}
        getName={(p) => p.name}
        getAmountLabel={(p) => formatKrw(p.current_balance)}
        selectedIds={draft.savings_product_ids}
        onToggle={(id) => toggleDraftId(setDraft, "savings_product_ids", id)}
        emptyMessage="연동 가능한 저축/투자 상품이 없어요."
        hint="잔액이 합산되고, 월 저축액은 연동 상품들의 월 계획 합계예요. 다른 목표에 연동된 상품과 부동산은 안 보여요."
      />
      <FundingSourceChecklist
        label="연동할 계좌 (복수 선택 가능)"
        items={accounts}
        getId={({ account }) => account.id}
        getName={({ account }) => account.name}
        getAmountLabel={({ balance }) => formatKrw(balance)}
        selectedIds={draft.account_ids}
        onToggle={(id) => toggleDraftId(setDraft, "account_ids", id)}
        emptyMessage="등록된 계좌가 없어요."
      />
      <FundingSourceChecklist
        label="연동할 대출 (연동 시 금액에서 차감돼요)"
        items={availableLoans}
        getId={(loan) => loan.id}
        getName={(loan) => loan.name}
        getAmountLabel={(loan) => `-${formatKrw(loan.balance)}`}
        amountClassName={amountToneClass("negative")}
        selectedIds={draft.loan_ids}
        onToggle={(id) => toggleDraftId(setDraft, "loan_ids", id)}
        emptyMessage="등록된 대출이 없어요."
        hint="현재 저축액 = 연동 상품·계좌 잔액 − 연동 대출 잔액"
      />
    </>
  );
}

import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import AmountInput from "@/components/common/AmountInput";
import Button from "@/components/common/Button";
import CollapsibleHint from "@/components/common/CollapsibleHint";
import FormInput from "@/components/common/FormInput";
import ExpectedReturnInput from "@/components/financialPlan/goalForm/ExpectedReturnInput";
import { useGrowlioGoalImport, type GoalFieldsProps } from "@/components/financialPlan/goalForm/goalFormShared";
import { useNetWorth } from "@/hooks/useReferenceData";
import { planViewLink } from "@/constants/routes";
import type { LoanOut, SavingsProductOut } from "@/types";
import { formatKrw } from "@/utils/format";
import { realEstateNetForGoal } from "@/utils/netWorth";

/** 순자산 목표 — 진행금액은 가구 순자산, 월 계획은 저축·투자 상품 계획 합이라 연동·월별 계획 입력이 없다. */
export default function NetWorthGoalFields({
  draft,
  setDraft,
  submitLabel,
  submitting,
  savingsProducts,
  availableSavingsProducts,
  loans,
}: GoalFieldsProps & {
  /** 부동산 제외 금액 계산용 전체 상품. */
  savingsProducts: SavingsProductOut[];
  /** growlio 불러오기의 연동 후보(순자산 목표는 연동을 저장하지 않지만 불러오기 동작은 장기 목표와 같다). */
  availableSavingsProducts: SavingsProductOut[];
  loans: LoanOut[];
}) {
  const { data: netWorthData } = useNetWorth();
  const growlioGoalMutation = useGrowlioGoalImport(availableSavingsProducts, setDraft);
  return (
    <>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300 space-y-1">
        <p>
          {draft.exclude_real_estate ? "지금 우리 순자산(부동산 제외)" : "지금 우리 순자산"}{" "}
          <span className="font-semibold text-gray-900 dark:text-gray-50">
            {netWorthData
              ? formatKrw(
                  Number(netWorthData.current.net_worth) -
                    (draft.exclude_real_estate ? realEstateNetForGoal(savingsProducts, loans) : 0),
                )
              : "불러오는 중…"}
          </span>
        </p>
        <label className="flex items-center gap-2 cursor-pointer text-gray-900 dark:text-gray-50">
          <input
            type="checkbox"
            checked={draft.exclude_real_estate}
            onChange={(e) => setDraft((d) => ({ ...d, exclude_real_estate: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 shrink-0"
          />
          부동산 제외
        </label>
        <CollapsibleHint summary="진행률은 자산 탭의 순자산을 따라가요.">
          순자산 = 계좌·저축·투자·부동산 − 대출(growlio 연동 포함). 부동산을 제외하면 부동산과 growlio에서 함께 가져온
          담보대출을 빼요(growlio 목표의 투자자산 기준과 같아요). 월 저축액은{" "}
          <Link to={planViewLink("이번 달")} className="font-semibold underline hover:no-underline">
            계획 탭
          </Link>{" "}
          저축·투자 계획 합계예요.
        </CollapsibleHint>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={<Download size={14} />}
        loading={growlioGoalMutation.isPending}
        onClick={() => growlioGoalMutation.mutate()}
      >
        growlio 목표 금액·수익률 불러오기
      </Button>
      <FormInput
        label="목표 이름"
        value={draft.name}
        maxLength={100}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        className="w-full"
        required
      />
      <AmountInput
        label="목표 순자산"
        value={draft.required_amount}
        onChange={(value) => setDraft((d) => ({ ...d, required_amount: value }))}
        className="w-full"
      />
      <FormInput
        label="목표일"
        type="date"
        value={draft.target_date}
        onChange={(e) => setDraft((d) => ({ ...d, target_date: e.target.value }))}
        className="w-full"
      />
      <ExpectedReturnInput value={draft.expected_annual_return_pct} setDraft={setDraft} />
      <Button type="submit" loading={submitting} className="mt-2">
        {submitLabel}
      </Button>
    </>
  );
}

import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import CategoryPicker from "@/components/common/CategoryPicker";
import FormInput from "@/components/common/FormInput";
import OwnerSelect from "@/components/common/OwnerSelect";
import PlanPeriodFields from "@/components/financialPlan/PlanPeriodFields";
import { usePlanPeriodTargets } from "@/components/financialPlan/usePlanPeriodTargets";
import type { AnnualPlanItemMonthlyTargetIn, CashflowSection, CategoryOut, UserOut } from "@/types";

export interface AnnualPlanItemFormValues {
  name: string;
  owner_user_id: string;
  category_id: string;
  start_month: string;
  end_month: string;
  monthly_targets: AnnualPlanItemMonthlyTargetIn[];
}

interface Props {
  year: number;
  section: CashflowSection;
  users: UserOut[] | undefined;
  categories: CategoryOut[];
  initialValues?: Partial<AnnualPlanItemFormValues>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: AnnualPlanItemFormValues) => void;
}

/** CashflowPlanItemForm의 연간 버전 — 항목명/구분/카테고리는 동일하게 입력받고, 금액 입력 한 줄
 * 대신 적용 기간(시작월~종료월) + "균등분배할 총액" + AnnualPlanMonthlyGrid로 그 기간의 월별
 * 목표금액을 함께 입력한다. 적용 기간이 바뀌면 syncTargetsToPeriod로 겹치는 달의 금액을 보존한 채
 * 행을 재구성한다. 실제 연간 합계는 별도로 들고 있지 않고 AnnualPlanMonthlyGrid 하단의 "월별
 * 목표금액 합계"가 monthlyTargets에서 항상 자동 계산해 보여준다. */
export default function AnnualPlanItemForm({
  year,
  section,
  users,
  categories,
  initialValues,
  submitLabel,
  submitting,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [ownerUserId, setOwnerUserId] = useState(initialValues?.owner_user_id ?? "");
  const [categoryId, setCategoryId] = useState(initialValues?.category_id ?? "");
  const period = usePlanPeriodTargets({
    start_month: initialValues?.start_month ?? `${year}-01`,
    end_month: initialValues?.end_month ?? `${year}-12`,
    monthly_targets: initialValues?.monthly_targets ?? [],
  });

  const sectionCategories =
    section === "income"
      ? categories.filter((c) => c.kind === "income")
      : categories.filter((c) => c.kind === "expense" && c.type === section);
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name,
      owner_user_id: ownerUserId,
      category_id: categoryId,
      start_month: period.startMonth,
      end_month: period.endMonth,
      monthly_targets: period.monthlyTargets,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {sectionCategories.length > 0 && (
        <CategoryPicker
          categories={sectionCategories}
          value={categoryId}
          onChange={(catId) => {
            setCategoryId(catId);
            setName((prev) =>
              prev.trim() === "" && catId
                ? (sectionCategories.find((c) => String(c.id) === catId)?.name ?? prev)
                : prev,
            );
          }}
          label="카테고리"
          placeholder="선택 안 함 (자유 입력 항목)"
          className="w-full"
        />
      )}
      <FormInput
        label="항목명"
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <OwnerSelect label="구분" value={ownerUserId} onChange={setOwnerUserId} users={users} />
      <PlanPeriodFields year={year} period={period} />
      <Button type="submit" loading={submitting} className="w-full justify-center">
        {submitLabel}
      </Button>
    </form>
  );
}

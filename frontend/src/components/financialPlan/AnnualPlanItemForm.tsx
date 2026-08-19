import { useState } from "react";
import type { FormEvent } from "react";
import AnnualPlanMonthlyGrid from "@/components/financialPlan/AnnualPlanMonthlyGrid";
import Button from "@/components/common/Button";
import CategoryPicker from "@/components/common/CategoryPicker";
import FormInput from "@/components/common/FormInput";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { syncTargetsToPeriod } from "@/utils/monthRange";
import { formatKrwPreview } from "@/utils/format";
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
  const [startMonth, setStartMonth] = useState(initialValues?.start_month ?? `${year}-01`);
  const [endMonth, setEndMonth] = useState(initialValues?.end_month ?? `${year}-12`);
  const [monthlyTargets, setMonthlyTargets] = useState<AnnualPlanItemMonthlyTargetIn[]>(
    initialValues?.monthly_targets ?? [],
  );
  const existingTotal = (initialValues?.monthly_targets ?? []).reduce(
    (sum, t) => sum + (Number(t.target_amount) || 0),
    0,
  );
  const [annualTotalDraft, setAnnualTotalDraft] = useState(existingTotal > 0 ? String(existingTotal) : "");

  const sectionCategories =
    section === "income"
      ? categories.filter((c) => c.kind === "income")
      : categories.filter((c) => c.kind === "expense" && c.type === section);
  const monthOptions = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  const changeStartMonth = (next: string) => {
    setStartMonth(next);
    setMonthlyTargets((targets) => syncTargetsToPeriod(next, endMonth, targets));
  };
  const changeEndMonth = (next: string) => {
    setEndMonth(next);
    setMonthlyTargets((targets) => syncTargetsToPeriod(startMonth, next, targets));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name,
      owner_user_id: ownerUserId,
      category_id: categoryId,
      start_month: startMonth,
      end_month: endMonth,
      monthly_targets: monthlyTargets,
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
        onChange={(e) => setName(e.target.value)}
        required
      />
      <div>
        <label className={`block mb-1 font-medium ${LABEL_SM}`}>구분</label>
        <select
          className={`${INPUT_SM} w-full`}
          value={ownerUserId}
          onChange={(e) => setOwnerUserId(e.target.value)}
        >
          <option value="">공통</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.display_name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>적용 시작월</label>
          <select
            className={`${INPUT_SM} w-full`}
            value={startMonth}
            onChange={(e) => changeStartMonth(e.target.value)}
          >
            {monthOptions
              .filter((ym) => ym <= endMonth)
              .map((ym) => (
                <option key={ym} value={ym}>
                  {Number(ym.slice(5))}월
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>적용 종료월</label>
          <select className={`${INPUT_SM} w-full`} value={endMonth} onChange={(e) => changeEndMonth(e.target.value)}>
            {monthOptions
              .filter((ym) => ym >= startMonth)
              .map((ym) => (
                <option key={ym} value={ym}>
                  {Number(ym.slice(5))}월
                </option>
              ))}
          </select>
        </div>
      </div>
      <FormInput
        label="균등분배할 총액"
        type="number"
        inputMode="decimal"
        value={annualTotalDraft}
        onChange={(e) => setAnnualTotalDraft(e.target.value)}
        hint="이 금액을 적용 기간의 달에 고르게 나눠 채워요. 지금까지 입력된 실제 합계는 아래 '월별 목표금액 합계'를 보세요."
        preview={Number(annualTotalDraft) > 0 ? formatKrwPreview(Number(annualTotalDraft)) : undefined}
      />
      <AnnualPlanMonthlyGrid
        startMonth={startMonth}
        endMonth={endMonth}
        targets={monthlyTargets}
        onChange={setMonthlyTargets}
        distributeAmount={annualTotalDraft}
      />
      <Button type="submit" loading={submitting} className="w-full justify-center">
        {submitLabel}
      </Button>
    </form>
  );
}

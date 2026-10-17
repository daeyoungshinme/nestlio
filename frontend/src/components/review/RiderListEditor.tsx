import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/common/Button";
import { RIDER_COVERAGE_LABEL } from "@/constants/insurance";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_MIN } from "@/constants/uiSizes";
import { formatKrw } from "@/utils/format";
import type { InsuranceRiderIn, InsuranceRiderOut, RiderCoverage } from "@/types";

export interface RiderDraft {
  /** 화면 key — 새 행은 id가 없어서 따로 둔다. */
  key: string;
  id: number | null;
  name: string;
  coverage: RiderCoverage;
  coverage_amount: string;
  premium: string;
  is_renewable: boolean;
  /** 입력 UI는 없지만 저장 때 그대로 돌려보내 서버 값을 지우지 않는다. */
  end_date: string | null;
}

let nextKey = 0;
const newKey = () => `rider-${++nextKey}`;

export function riderDraftFrom(rider: InsuranceRiderOut): RiderDraft {
  return {
    key: newKey(),
    id: rider.id,
    name: rider.name,
    coverage: rider.coverage,
    coverage_amount: rider.coverage_amount ?? "",
    premium: rider.premium,
    is_renewable: rider.is_renewable,
    end_date: rider.end_date,
  };
}

export function riderPayload(draft: RiderDraft): InsuranceRiderIn {
  return {
    id: draft.id,
    name: draft.name.trim() || RIDER_COVERAGE_LABEL[draft.coverage],
    coverage: draft.coverage,
    coverage_amount: draft.coverage_amount === "" ? null : draft.coverage_amount,
    premium: draft.premium === "" ? "0" : draft.premium,
    is_renewable: draft.is_renewable,
    end_date: draft.end_date,
  };
}

interface Props {
  riders: RiderDraft[];
  onChange: (riders: RiderDraft[]) => void;
  /** 계약 보험료(납입 주기 그대로) — 특약 합을 뺀 주계약·기타 미리보기용. */
  policyPremium: string;
  frequencyLabel: string;
}

/** 보험 계약의 주요 특약 입력 — 보장 종류·가입금액·특약 보험료·갱신형. 다 넣지 않아도 되고 나머지는 "주계약·기타"로 계산된다. */
export default function RiderListEditor({ riders, onChange, policyPremium, frequencyLabel }: Props) {
  const fieldId = useId();
  const update = (key: string, patch: Partial<RiderDraft>) =>
    onChange(riders.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () =>
    onChange([
      ...riders,
      { key: newKey(), id: null, name: "", coverage: "cancer", coverage_amount: "", premium: "", is_renewable: false, end_date: null },
    ]);
  const remove = (key: string) => onChange(riders.filter((r) => r.key !== key));

  const ridersTotal = riders.reduce((sum, r) => sum + (Number(r.premium) || 0), 0);
  const rest = (Number(policyPremium) || 0) - ridersTotal;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className={`font-medium ${LABEL_SM}`}>주요 특약 (보험료 큰 것 위주로)</p>
        <Button type="button" size="sm" variant="secondary" icon={<Plus size={14} />} onClick={add}>
          특약 추가
        </Button>
      </div>
      {riders.map((rider, index) => (
        <div key={rider.key} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label htmlFor={`${fieldId}-${index}-coverage`} className={`block mb-1 ${LABEL_SM}`}>
                보장
              </label>
              <select
                id={`${fieldId}-${index}-coverage`}
                className={`${INPUT_SM} w-full`}
                value={rider.coverage}
                onChange={(e) => update(rider.key, { coverage: e.target.value as RiderCoverage })}
              >
                {Object.entries(RIDER_COVERAGE_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => remove(rider.key)}
              aria-label={`특약 ${index + 1} 삭제`}
              className={`${TOUCH_TARGET_MIN} rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200`}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div>
            <label htmlFor={`${fieldId}-${index}-name`} className={`block mb-1 ${LABEL_SM}`}>
              특약 이름 (선택)
            </label>
            <input
              id={`${fieldId}-${index}-name`}
              className={`${INPUT_SM} w-full`}
              value={rider.name}
              maxLength={100}
              placeholder={RIDER_COVERAGE_LABEL[rider.coverage]}
              onChange={(e) => update(rider.key, { name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${fieldId}-${index}-amount`} className={`block mb-1 ${LABEL_SM}`}>
                {rider.coverage === "hospitalization" ? "가입금액(1일)" : "가입금액"}
              </label>
              <input
                id={`${fieldId}-${index}-amount`}
                type="number"
                inputMode="decimal"
                className={`${INPUT_SM} w-full`}
                value={rider.coverage_amount}
                onChange={(e) => update(rider.key, { coverage_amount: e.target.value })}
              />
              {rider.coverage_amount && (
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{formatKrw(rider.coverage_amount)}</p>
              )}
            </div>
            <div>
              <label htmlFor={`${fieldId}-${index}-premium`} className={`block mb-1 ${LABEL_SM}`}>
                보험료({frequencyLabel})
              </label>
              <input
                id={`${fieldId}-${index}-premium`}
                type="number"
                inputMode="decimal"
                className={`${INPUT_SM} w-full`}
                value={rider.premium}
                onChange={(e) => update(rider.key, { premium: e.target.value })}
              />
            </div>
          </div>
          <label className={`flex items-center gap-2 min-h-[44px] ${LABEL_SM}`}>
            <input
              type="checkbox"
              checked={rider.is_renewable}
              onChange={(e) => update(rider.key, { is_renewable: e.target.checked })}
              className="h-4 w-4"
            />
            갱신형 특약
          </label>
        </div>
      ))}
      {riders.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          특약 합 {formatKrw(ridersTotal)} · 주계약·기타 {formatKrw(Math.max(rest, 0))}
          {rest < 0 ? " — 특약 합이 계약 보험료보다 커요" : ""}
        </p>
      )}
    </div>
  );
}

import { useId } from "react";
import { COVERAGE_LABEL } from "@/constants/insurance";
import { LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_COMPACT_MOBILE_ONLY } from "@/constants/uiSizes";
import { selectableChipClass } from "@/utils/colors";
import type { Coverage } from "@/types";

/** 특약을 입력하지 않은 계약의 주요 보장 태그 — 같은 피보험자의 보장 중복을 찾을 때 쓴다(특약이 있으면 서버가 특약에서 만든다). */
export default function CoverageChips({
  selected,
  onToggle,
}: {
  selected: Coverage[];
  onToggle: (coverage: Coverage) => void;
}) {
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className={`block mb-1 font-medium ${LABEL_SM}`}>
        주요 보장 (겹치는 보장을 찾을 때 써요)
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {(Object.keys(COVERAGE_LABEL) as Coverage[]).map((coverage) => {
          const isSelected = selected.includes(coverage);
          return (
            <button
              key={coverage}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(coverage)}
              className={`rounded-full px-3 text-xs font-medium transition-colors ${TOUCH_TARGET_COMPACT_MOBILE_ONLY} ${selectableChipClass(isSelected)}`}
            >
              {COVERAGE_LABEL[coverage]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useId, useState } from "react";
import { LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { errorMessageTextClass } from "@/utils/colors";
import type { CategoryOut } from "@/types";

/** 접힌 상태에서 보여줄 칩 수 — 360px 시트에서 2~3줄. */
export const CATEGORY_CHIP_VISIBLE_COUNT = 8;

/** 최근 사용 빈도순 → 나머지는 `sort_order`순. `recentCategoryIds`는 최근 거래의 카테고리 id 목록(중복 = 빈도). */
export function orderCategoriesByUsage(categories: CategoryOut[], recentCategoryIds: number[]): CategoryOut[] {
  const counts = new Map<number, number>();
  for (const id of recentCategoryIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...categories].sort(
    (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.sort_order - b.sort_order,
  );
}

interface Props {
  /** 이미 종류(수입/지출)로 거른 카테고리. */
  categories: CategoryOut[];
  value: string;
  onChange: (categoryId: string) => void;
  recentCategoryIds?: number[];
  label?: string;
  /** 제출 시도 후 미선택이면 부모가 켠다. */
  showRequiredError?: boolean;
}

const CHIP_BASE = `px-3 rounded-full border text-sm transition-colors whitespace-nowrap ${TOUCH_TARGET_MIN_HEIGHT}`;
const CHIP_IDLE =
  "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800";
const CHIP_SELECTED =
  "border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-semibold";

/** 거래 입력 시트의 카테고리 선택 — 네이티브 select(iOS 휠)를 열지 않고 자주 쓰는 카테고리를 탭 한 번에 고른다.
 * 기본 선택값이 없어서 바꾸지 않고 저장해 오분류되는 일이 없다(부모가 미선택 제출을 막는다). */
export default function CategoryChipPicker({
  categories,
  value,
  onChange,
  recentCategoryIds = [],
  label = "카테고리",
  showRequiredError,
}: Props) {
  const labelId = useId();
  const [expanded, setExpanded] = useState(false);
  const ordered = orderCategoriesByUsage(categories, recentCategoryIds);
  const collapsible = ordered.length > CATEGORY_CHIP_VISIBLE_COUNT;
  let visible = collapsible && !expanded ? ordered.slice(0, CATEGORY_CHIP_VISIBLE_COUNT) : ordered;
  // 접힌 목록 밖의 카테고리가 선택돼 있으면(수정 폼·계획 칩 프리필) 그것도 보여줘야 선택 상태가 보인다.
  const selected = ordered.find((c) => String(c.id) === value);
  if (selected && !visible.includes(selected)) visible = [...visible, selected];
  const hiddenCount = ordered.length - visible.length;

  return (
    <div className="w-full">
      <span id={labelId} className={`block mb-1 font-medium ${LABEL_SM}`}>
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {visible.map((c) => {
          const isSelected = String(c.id) === value;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(String(c.id))}
              className={`${CHIP_BASE} ${isSelected ? CHIP_SELECTED : CHIP_IDLE}`}
            >
              {c.name}
            </button>
          );
        })}
        {collapsible && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
            className={`${CHIP_BASE} border-dashed ${CHIP_IDLE}`}
          >
            {expanded ? "접기" : `더보기 ${hiddenCount}`}
          </button>
        )}
      </div>
      {showRequiredError && !value && (
        <p role="alert" className={`mt-1 text-xs ${errorMessageTextClass()}`}>
          카테고리를 골라주세요
        </p>
      )}
    </div>
  );
}

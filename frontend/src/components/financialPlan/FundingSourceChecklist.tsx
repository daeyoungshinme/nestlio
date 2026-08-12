import { FORM_LABEL } from "@/constants/inputStyles";

interface Props<T> {
  label: string;
  items: T[];
  getId: (item: T) => number;
  getName: (item: T) => string;
  getAmountLabel: (item: T) => string;
  amountClassName?: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyMessage: string;
  hint?: string;
}

/** 목표 폼의 "연동할 저축/투자 상품·계좌·대출" 체크박스 목록 3벌이 공유하던 마크업을
 * 하나로 합친 것 — 항목 타입만 다를 뿐 레이아웃(체크박스+이름+금액, 스크롤 목록)이 동일했다. */
export default function FundingSourceChecklist<T>({
  label,
  items,
  getId,
  getName,
  getAmountLabel,
  amountClassName,
  selectedIds,
  onToggle,
  emptyMessage,
  hint,
}: Props<T>) {
  return (
    <div>
      <label className={FORM_LABEL}>{label}</label>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">{emptyMessage}</p>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-40 overflow-y-auto">
          {items.map((item) => {
            const id = String(getId(item));
            return (
              <label key={id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer">
                <span className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(id)}
                    onChange={() => onToggle(id)}
                    className="h-4 w-4 rounded border-gray-300 shrink-0"
                  />
                  <span className="truncate text-gray-900 dark:text-gray-50">{getName(item)}</span>
                </span>
                <span className={`text-xs shrink-0 ${amountClassName ?? "text-gray-500 dark:text-gray-400"}`}>
                  {getAmountLabel(item)}
                </span>
              </label>
            );
          })}
        </div>
      )}
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

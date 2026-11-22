import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import type { AutoCategorySource, ImportResultOut } from "@/types";
import { cautionTextClass, errorMessageTextClass } from "@/utils/colors";
import { formatKrw } from "@/utils/format";

/** 건너뛴 행 목록은 이만큼만 — 형식이 틀린 CSV면 수백 줄이 화면을 덮는다. */
const SKIPPED_ROWS_LIMIT = 20;

const AUTO_CATEGORY_SOURCE_LABELS: Record<AutoCategorySource, string> = {
  history: "이전 거래",
  keyword: "가맹점",
  fallback: "기본값",
};

export default function ImportResultCard({ result, onUndo }: { result: ImportResultOut; onUndo?: () => void }) {
  const shownSkipped = result.skipped.slice(0, SKIPPED_ROWS_LIMIT);
  const hiddenSkipped = result.skipped.length - shownSkipped.length;
  const autoCategorized = result.auto_categorized;
  const shownAuto = autoCategorized.slice(0, SKIPPED_ROWS_LIMIT);
  const hiddenAuto = autoCategorized.length - shownAuto.length;
  const shownMerged = result.merged.slice(0, SKIPPED_ROWS_LIMIT);
  const hiddenMerged = result.merged.length - shownMerged.length;
  return (
    <div className="card space-y-2">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
        {result.created}건 생성됨, {result.updated > 0 && `${result.updated}건 채움, `}
        {result.skipped.length}건 건너뜀
      </p>
      {autoCategorized.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {autoCategorized.length}건은 메모를 보고 카테고리를 자동으로 정했어요
          </p>
          <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            {shownAuto.map((row) => (
              <li key={row.line}>
                {row.line}행 {row.description} → {row.category_name} ({AUTO_CATEGORY_SOURCE_LABELS[row.source]})
              </li>
            ))}
            {hiddenAuto > 0 && <li>외 {hiddenAuto}건</li>}
          </ul>
        </div>
      )}
      {result.unmatched_accounts.length > 0 && (
        <p className={`text-xs ${cautionTextClass()}`}>
          등록되지 않은 계좌라 계좌 없이 넣었어요: {result.unmatched_accounts.join(", ")}
        </p>
      )}
      {result.unmatched_cards.length > 0 && (
        <p className={`text-xs ${cautionTextClass()}`}>
          등록되지 않은 카드라 카드 없이 넣었어요: {result.unmatched_cards.join(", ")}
        </p>
      )}
      {result.unmatched_owners.length > 0 && (
        <p className={`text-xs ${cautionTextClass()}`}>
          가구 구성원이 아니라 공통으로 넣었어요: {result.unmatched_owners.join(", ")}
        </p>
      )}
      {result.merged.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            같은 날 비슷한 메모 {result.merged.length}묶음은 금액을 합쳐 한 건으로 만들었어요
          </p>
          <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            {shownMerged.map((group) => (
              <li key={group.lines[0]}>
                {group.lines.join("·")}행 {group.description} → {formatKrw(group.amount)}
              </li>
            ))}
            {hiddenMerged > 0 && <li>외 {hiddenMerged}묶음</li>}
          </ul>
        </div>
      )}
      {result.skipped.length > 0 && (
        <ul className={`text-xs ${errorMessageTextClass()} space-y-1`}>
          {shownSkipped.map((row, i) => (
            <li key={i}>
              {row.line}행: {row.reason}
            </li>
          ))}
          {hiddenSkipped > 0 && <li>외 {hiddenSkipped}건</li>}
        </ul>
      )}
      {onUndo && result.created_ids.length > 0 && (
        <button
          type="button"
          onClick={onUndo}
          className={`inline-flex items-center ${TOUCH_TARGET_MIN_HEIGHT} text-xs ${errorMessageTextClass()} hover:underline`}
        >
          방금 가져온 {result.created_ids.length}건 되돌리기
        </button>
      )}
    </div>
  );
}

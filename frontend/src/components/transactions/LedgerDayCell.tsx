import { memo } from "react";
import { Repeat } from "lucide-react";
import type { LedgerView } from "@/constants/routes";
import { recurringAccentIconClass, transactionAmountTextColor, transactionTypeBadgeStyle } from "@/utils/colors";
import { formatDayHeader } from "@/utils/date";
import { formatKrw, formatKrwAxis, formatKrwCompact } from "@/utils/format";
import { LEDGER_DAY_CELL_MIN_HEIGHT } from "@/constants/uiSizes";
import type { EventOut, RecurringOut, TransactionOut } from "@/types";
import { sumAmounts } from "@/utils/amount";
import { eventPreviewLines, txPreviewLines } from "@/components/transactions/ledgerCellPreview";
import type { CellPreview } from "@/components/transactions/ledgerCellPreview";

/** sm 이상 칸에 이름으로 보여줄 최대 줄 수 — 넘치면 `+N`. 칸 높이(LEDGER_DAY_CELL_MIN_HEIGHT)에 맞춘 값. */
const PREVIEW_LINES = 2;

interface Props {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  /** 캘린더 아래 탭 — 칸 미리보기도 이 탭의 항목(내역=거래, 일정=일정·반복 예정)을 보여준다. */
  view: LedgerView;
  transactions: TransactionOut[];
  events: EventOut[];
  recurringDue: RecurringOut[];
  onSelect: (date: string) => void;
}

function PreviewLines({ preview, className }: { preview: CellPreview; className: string }) {
  if (preview.lines.length === 0) return null;
  return (
    <div className={`${className} flex-col items-start w-full min-w-0`}>
      {preview.lines.map((line) => (
        <span
          key={line.key}
          className={`flex items-center gap-0.5 w-full min-w-0 text-[11px] sm:text-xs leading-tight ${
            line.muted ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-600 dark:text-gray-300"
          }`}
        >
          {line.kind === "recurring" && (
            <Repeat size={9} className={`shrink-0 ${recurringAccentIconClass()}`} aria-hidden="true" />
          )}
          <span className="truncate">{line.label}</span>
        </span>
      ))}
      {preview.more > 0 && (
        <span className="text-[11px] sm:text-xs leading-tight text-gray-400 dark:text-gray-500">+{preview.more}</span>
      )}
    </div>
  );
}

function LedgerDayCell({
  date,
  day,
  inCurrentMonth,
  isToday,
  isSelected,
  view,
  transactions,
  events,
  recurringDue,
  onSelect,
}: Props) {
  const income = sumAmounts(transactions.filter((t) => t.type === "income"), (t) => t.amount);
  const expense = sumAmounts(
    transactions.filter((t) => t.type === "expense" && !t.category.is_savings),
    (t) => t.amount,
  );
  // 모바일은 셀이 좁아(~36px) 금액·이름을 다 넣으면 행 높이가 들쭉날쭉해진다 — 내역 탭은 순액 한 줄,
  // 일정 탭은 첫 일정 한 줄만 보여주고 상세는 날짜를 눌러 캘린더 아래에서 본다.
  const net = income - expense;

  const incomeRecurring = recurringDue.filter((r) => r.type === "income");
  const expenseRecurring = recurringDue.filter((r) => r.type === "expense");

  return (
    <button
      type="button"
      disabled={!inCurrentMonth}
      aria-pressed={inCurrentMonth ? isSelected : undefined}
      aria-label={formatDayHeader(date)}
      onClick={() => onSelect(date)}
      className={`flex flex-col items-start gap-0.5 min-w-0 ${LEDGER_DAY_CELL_MIN_HEIGHT} p-1 sm:p-1.5 rounded-lg border bg-white dark:bg-gray-900 text-left transition-colors ${
        isSelected
          ? "border-primary-500 ring-1 ring-primary-500"
          : "border-gray-100 dark:border-gray-800"
      } ${inCurrentMonth ? "hover:bg-gray-50 dark:hover:bg-gray-800" : "opacity-40 cursor-default"}`}
    >
      <span
        className={`text-xs sm:text-sm font-medium ${
          isToday
            ? "bg-primary-600 text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center"
            : "text-gray-700 dark:text-gray-300"
        }`}
      >
        {day}
      </span>

      {view === "일정" ? (
        <>
          <PreviewLines preview={eventPreviewLines(events, recurringDue, 1)} className="flex sm:hidden" />
          <PreviewLines preview={eventPreviewLines(events, recurringDue, PREVIEW_LINES)} className="hidden sm:flex" />
        </>
      ) : (
        <>
          {/* 모바일: 순액 한 줄 + 일정 점 */}
          <div className="flex sm:hidden flex-col items-start gap-0.5 w-full">
            {transactions.length > 0 &&
              (net !== 0 ? (
                <span
                  className={`text-[11px] font-semibold tabular-nums tracking-tight truncate w-full ${transactionAmountTextColor(net > 0 ? "income" : "expense")}`}
                  title={`수입 ${formatKrw(income)} · 지출 ${formatKrw(expense)}`}
                >
                  {/* 셀 폭이 ~36px라 "원"을 뺀 축 표기("-123만")로 줄인다. */}
                  {net > 0 ? "+" : "-"}
                  {formatKrwAxis(Math.abs(net))}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">거래 {transactions.length}</span>
              ))}
            {(events.length > 0 || recurringDue.length > 0) && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-primary-400 dark:bg-primary-500"
                title={`일정·반복 예정 ${events.length + recurringDue.length}건`}
              />
            )}
          </div>

          {/* sm 이상: 수입/지출 금액 + 거래 이름 + 반복 예정 배지 */}
          {income > 0 && (
            <span
              className={`hidden sm:block text-xs font-medium truncate w-full ${transactionAmountTextColor("income")}`}
              title={formatKrw(income)}
            >
              +{formatKrwCompact(income)}
            </span>
          )}
          {expense > 0 && (
            <span
              className={`hidden sm:block text-xs font-medium truncate w-full ${transactionAmountTextColor("expense")}`}
              title={formatKrw(expense)}
            >
              -{formatKrwCompact(expense)}
            </span>
          )}
          <PreviewLines preview={txPreviewLines(transactions, PREVIEW_LINES)} className="hidden sm:flex" />
          {(recurringDue.length > 0 || events.length > 0) && (
            <div className="hidden sm:flex flex-wrap items-center gap-1 w-full">
              {incomeRecurring.length > 0 && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[11px] sm:text-xs font-medium px-1 rounded-sm ${transactionTypeBadgeStyle("income")}`}
                  title={`반복 수입 예정 ${incomeRecurring.length}건: ${incomeRecurring.map((r) => r.name).join(", ")}`}
                >
                  <Repeat size={9} className="shrink-0" aria-hidden="true" />
                  {incomeRecurring.length}
                </span>
              )}
              {expenseRecurring.length > 0 && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[11px] sm:text-xs font-medium px-1 rounded-sm ${transactionTypeBadgeStyle("expense")}`}
                  title={`반복 지출 예정 ${expenseRecurring.length}건: ${expenseRecurring.map((r) => r.name).join(", ")}`}
                >
                  <Repeat size={9} className="shrink-0" aria-hidden="true" />
                  {expenseRecurring.length}
                </span>
              )}
              {events.length > 0 && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-primary-400 dark:bg-primary-500"
                  title={`일정 ${events.length}건: ${events.map((e) => e.title).join(", ")}`}
                />
              )}
            </div>
          )}
        </>
      )}
    </button>
  );
}

export default memo(LedgerDayCell);

import { Repeat } from "lucide-react";
import { recurringAccentIconClass, transactionAmountTextColor } from "@/utils/colors";
import { formatKrw } from "@/utils/format";
import type { RecurringOut } from "@/types";

/** 그날 예정된 반복 거래 카드 목록 — 일정 목록(`ScheduleEventList`)과 가계부 날짜 상세(`LedgerDayDetail`)가 공유한다. */
export default function RecurringDueCards({ recurringDue }: { recurringDue: RecurringOut[] }) {
  if (recurringDue.length === 0) return null;
  return (
    <div className="space-y-2">
      {recurringDue.map((recurring) => (
        <div key={recurring.id} className="card flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <Repeat size={14} className={`shrink-0 ${recurringAccentIconClass()}`} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{recurring.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">반복 내역 예정</p>
            </div>
          </div>
          <span className={`text-sm font-semibold tabular-nums shrink-0 ${transactionAmountTextColor(recurring.type)}`}>
            {recurring.type === "income" ? "+" : "-"}
            {formatKrw(recurring.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

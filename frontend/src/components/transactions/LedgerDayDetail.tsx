import { Plus, Receipt } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import RecurringDueCards from "@/components/schedule/RecurringDueCards";
import ScheduleEventList from "@/components/schedule/ScheduleEventList";
import TransactionListItem from "@/components/transactions/TransactionListItem";
import type { LedgerView } from "@/constants/routes";
import { sumAmounts } from "@/utils/amount";
import { transactionAmountTextColor } from "@/utils/colors";
import { formatDayHeader } from "@/utils/date";
import { formatKrw } from "@/utils/format";
import type { EventOut, RecurringOut, TransactionOut, UserOut } from "@/types";

interface Props {
  date: string;
  view: LedgerView;
  transactions: TransactionOut[];
  events: EventOut[];
  recurringDue: RecurringOut[];
  /** 검색어가 걸려 있으면 칸·상세 모두 검색 결과만 보인다는 걸 알린다(검색은 서버 쿼리라 날짜 그룹에도 적용됨). */
  searchActive: boolean;
  showUser: boolean;
  users?: UserOut[];
  /** "한 달 전체"로 돌아가기(날짜 선택 해제). */
  onClear: () => void;
  onAddTransaction: () => void;
  onEditTransaction: (tx: TransactionOut) => void;
  onAddEvent: () => void;
  onEditEvent: (event: EventOut) => void;
  onDeleteEvent: (event: EventOut) => void;
  onToggleEventComplete: (event: EventOut) => void;
}

/** 캘린더에서 고른 날짜의 이력 — 캘린더 바로 아래, 선택한 탭(내역/일정)의 그날 항목만 보여준다. 구 `LedgerDayModal`을
 * 대체한다: 추가·수정은 페이지의 독립 폼 모달로 열고, 저장해도 이 상세가 그대로 남아 하루치를 연달아 입력할 수 있다. */
export default function LedgerDayDetail({
  date,
  view,
  transactions,
  events,
  recurringDue,
  searchActive,
  showUser,
  users,
  onClear,
  onAddTransaction,
  onEditTransaction,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  onToggleEventComplete,
}: Props) {
  const isLedger = view === "내역";
  const net = sumAmounts(
    transactions.filter((tx) => !tx.category.is_savings),
    (tx) => (tx.type === "income" ? 1 : -1) * Number(tx.amount),
  );
  const sortedTransactions = transactions.slice().sort((a, b) => a.id - b.id);

  return (
    <section aria-label={`${formatDayHeader(date)} ${view}`} className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
            {formatDayHeader(date)}
            {isLedger && transactions.length > 0 && (
              <span className={`ml-2 tabular-nums ${transactionAmountTextColor(net >= 0 ? "income" : "expense")}`}>
                {net >= 0 ? "+" : "-"}
                {formatKrw(Math.abs(net))}
              </span>
            )}
          </h2>
          {searchActive && <p className="text-xs text-gray-500 dark:text-gray-400">검색어가 적용된 내역만 보여요</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onClear}>
            한 달 전체
          </Button>
          <Button size="sm" icon={<Plus size={14} />} onClick={isLedger ? onAddTransaction : onAddEvent}>
            {isLedger ? "내역 추가" : "일정 추가"}
          </Button>
        </div>
      </div>

      {isLedger ? (
        <div className="space-y-2">
          <RecurringDueCards recurringDue={recurringDue} />
          {sortedTransactions.length === 0 ? (
            recurringDue.length === 0 && <EmptyState icon={Receipt} title="이 날 내역이 없어요" compact />
          ) : (
            sortedTransactions.map((tx) => (
              <TransactionListItem key={tx.id} tx={tx} onEdit={onEditTransaction} showUser={showUser} users={users} />
            ))
          )}
        </div>
      ) : (
        <ScheduleEventList
          events={events}
          recurringDue={recurringDue}
          onEdit={onEditEvent}
          onDelete={onDeleteEvent}
          onToggleComplete={onToggleEventComplete}
        />
      )}
    </section>
  );
}

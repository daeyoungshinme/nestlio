import { PAYMENT_METHOD_LABEL } from "@/constants/transactions";
import { transactionAmountTextColor } from "@/utils/colors";
import { formatDate, formatKrw } from "@/utils/format";
import type { TransactionOut, UserOut } from "@/types";

interface Props {
  tx: TransactionOut;
  onEdit: (tx: TransactionOut) => void;
  showDate?: boolean;
  showUser?: boolean;
  users?: UserOut[];
  hideCategoryBadge?: boolean;
}

/** 거래 한 줄 — 행 전체가 수정 버튼이다(삭제는 수정 폼 안). 왼쪽은 메모/부가정보 2줄, 오른쪽은 금액이라
 * 금액만 세로로 훑어볼 수 있다. 수입/지출은 금액 부호·색으로 이미 구분돼 따로 배지를 두지 않는다. */
export default function TransactionListItem({ tx, onEdit, showDate, showUser, users, hideCategoryBadge }: Props) {
  const ownerLabel = tx.owner_user_id
    ? (users?.find((u) => u.id === tx.owner_user_id)?.display_name ?? "공통")
    : "공통";
  const title = tx.description || tx.category.name;
  const meta = [
    !hideCategoryBadge && tx.description ? tx.category.name : null,
    tx.savings_product ? `→ ${tx.savings_product.name}` : null,
    // 카드로 결제했으면 결제수단 라벨 대신 카드 이름 (영속 캐시의 예전 응답엔 card가 없을 수 있다)
    tx.card ? tx.card.name : tx.payment_method ? PAYMENT_METHOD_LABEL[tx.payment_method] : null,
    showUser ? ownerLabel : null,
    showDate ? formatDate(tx.transaction_date) : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => onEdit(tx)}
      className="card w-full flex items-center justify-between gap-3 text-left min-h-[56px] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{title}</span>
        {meta.length > 0 && (
          <span className="block mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{meta.join(" · ")}</span>
        )}
      </span>
      <span
        className={`shrink-0 text-base font-semibold tabular-nums whitespace-nowrap ${transactionAmountTextColor(tx.type)}`}
      >
        {tx.type === "income" ? "+" : "-"}
        {formatKrw(tx.amount)}
      </span>
    </button>
  );
}

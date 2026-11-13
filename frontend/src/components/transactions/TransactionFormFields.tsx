import type { UiType } from "@/components/transactions/TransactionQuickPicks";
import { CARD_PREFIX, METHOD_PREFIX } from "@/components/transactions/useTransactionForm";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { CARD_TYPE_LABEL, PAYMENT_METHOD_LABEL } from "@/constants/transactions";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { errorMessageTextClass } from "@/utils/colors";
import type { AccountWithBalanceOut, CardOut, PaymentMethod, SavingsProductOut } from "@/types";

const TYPE_TOGGLE_LABEL: Record<UiType, string> = { expense: "지출", income: "수입", savings: "저축/투자" };

/** 지출/수입(/저축·투자) 토글 — 폼의 첫 결정이라 모바일에서 폭 전체·44px 높이로 누르기 쉽게 한다. */
export function TransactionTypeToggle({
  value,
  onChange,
  showSavings,
  className,
}: {
  value: UiType;
  onChange: (next: UiType) => void;
  /** 저축 카테고리가 있을 때만 저축/투자를 고를 수 있다. */
  showSavings: boolean;
  className: string;
}) {
  const options: UiType[] = showSavings ? ["expense", "income", "savings"] : ["expense", "income"];
  return (
    <div className={`flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ${className}`}>
      {options.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`flex-1 px-3 ${TOUCH_TARGET_MIN_HEIGHT} text-sm font-medium rounded-md transition-colors ${
            value === t
              ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-50"
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {TYPE_TOGGLE_LABEL[t]}
        </button>
      ))}
    </div>
  );
}

/** 결제 선택 — 카드(카드 종류 표시)와 카드가 아닌 결제수단을 한 목록에서 고른다. */
export function PaymentSelect({
  id,
  selectClassName,
  value,
  cardOptions,
  methodOptions,
  cardsError,
  onChange,
}: {
  id: string;
  selectClassName: string;
  value: string;
  cardOptions: CardOut[];
  methodOptions: readonly PaymentMethod[];
  cardsError: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={`block mb-1 font-medium ${LABEL_SM}`}>결제</label>
      <select id={id} className={`${INPUT_SM} ${selectClassName}`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">(선택 안 함)</option>
        {cardOptions.length > 0 && (
          <optgroup label="카드">
            {cardOptions.map((card) => (
              <option key={card.id} value={`${CARD_PREFIX}${card.id}`}>
                {card.name} ({CARD_TYPE_LABEL[card.card_type]})
              </option>
            ))}
          </optgroup>
        )}
        {methodOptions.map((method) => (
          <option key={method} value={`${METHOD_PREFIX}${method}`}>
            {PAYMENT_METHOD_LABEL[method]}
          </option>
        ))}
      </select>
      {cardsError && (
        <p className={`mt-1 text-xs ${errorMessageTextClass()}`}>결제카드 목록을 불러오지 못했어요. 카드는 나중에 다시 골라 주세요.</p>
      )}
    </div>
  );
}

/** 계좌 선택 — 카드를 골랐으면 카드의 결제계좌로 잠긴다. */
export function AccountSelect({
  id,
  selectClassName,
  value,
  accounts,
  lockedByCard,
  onChange,
}: {
  id: string;
  selectClassName: string;
  value: string;
  accounts: AccountWithBalanceOut[];
  lockedByCard: boolean;
  onChange: (accountId: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={`block mb-1 font-medium ${LABEL_SM}`}>계좌</label>
      <select
        id={id}
        className={`${INPUT_SM} ${selectClassName}`}
        value={value}
        disabled={lockedByCard}
        title={lockedByCard ? "카드의 결제계좌로 연결돼요" : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{lockedByCard ? "(결제계좌 미지정)" : "(선택 안 함)"}</option>
        {accounts.map(({ account }) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** 저축/투자 거래의 저축상품(필수). */
export function SavingsProductSelect({
  id,
  selectClassName,
  value,
  savingsProducts,
  onChange,
}: {
  id: string;
  selectClassName: string;
  value: string;
  savingsProducts: SavingsProductOut[];
  onChange: (productId: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={`block mb-1 font-medium ${LABEL_SM}`}>저축상품</label>
      <select
        id={id}
        className={`${INPUT_SM} ${selectClassName}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      >
        <option value="">선택</option>
        {savingsProducts.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </select>
    </div>
  );
}

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import AmountInput from "@/components/common/AmountInput";
import Button from "@/components/common/Button";
import CategoryChipPicker from "@/components/common/CategoryChipPicker";
import CategoryPicker from "@/components/common/CategoryPicker";
import FormInput from "@/components/common/FormInput";
import OwnerSelect from "@/components/common/OwnerSelect";
import TransactionQuickPicks from "@/components/transactions/TransactionQuickPicks";
import {
  AccountSelect,
  PaymentSelect,
  SavingsProductSelect,
  TransactionTypeToggle,
} from "@/components/transactions/TransactionFormFields";
import { useTransactionForm, type TransactionFormValues } from "@/components/transactions/useTransactionForm";
import { INLINE_BUTTON_OFFSET, LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import type {
  AccountWithBalanceOut,
  CardOut,
  CategoryOut,
  SavingsProductOut,
  TransactionCreateIn,
  UserOut,
} from "@/types";

export type { TransactionFormValues } from "@/components/transactions/useTransactionForm";

interface Props {
  categories: CategoryOut[];
  accounts: AccountWithBalanceOut[];
  savingsProducts: SavingsProductOut[];
  users: UserOut[];
  /** 신규 등록 시 "소유자" 기본값으로 프리필할 로그인 사용자 id. */
  currentUserId?: string;
  initialValues?: Partial<TransactionFormValues>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (payload: TransactionCreateIn) => void;
  layout?: "row" | "stack";
  /** 새 거래 등록 컨텍스트에서만 "자주 쓰는 항목" 불러오기를 노출한다 (수정 폼에서는 숨김). */
  isNew: boolean;
  /** 수정 폼에서만 — 목록 행에 삭제 버튼을 두지 않고 여기로 모았다(확인 모달은 부모가 띄운다). */
  onDelete?: () => void;
  /** 수정 중인 거래의 카드 — 비활성화된 카드여도 선택지에 남겨 그대로 저장할 수 있게. */
  editingCard?: CardOut | null;
}

/** 거래 입력 폼. 상태·동작은 `useTransactionForm`, 선택 칸은 `TransactionFormFields`. 날짜 시트·모달의 세로 배치("stack")와
 * 한 줄 배치("row")를 함께 그린다. */
export default function TransactionForm({
  categories,
  accounts,
  savingsProducts,
  users,
  currentUserId,
  initialValues,
  submitLabel,
  submitting,
  onSubmit,
  layout = "row",
  isNew,
  onDelete,
  editingCard,
}: Props) {
  const fieldId = useId();
  const form = useTransactionForm({ categories, initialValues, isNew, currentUserId, editingCard, onSubmit });
  const { values, setField, uiType, payment } = form;

  /** 계좌·소유자 등 부가 필드 접기/펼치기. 이미 값이 있는 상태(수정 모드 포함)로 시작하면 숨겨져 놀라지 않도록 펼친 채로 시작한다. */
  const [showDetails, setShowDetails] = useState(
    () => !isNew || Boolean(initialValues?.account_id || initialValues?.owner_user_id || initialValues?.card_id),
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    form.handleSubmit();
  };

  const isStack = layout === "stack";
  const containerClass = isStack ? "flex flex-col gap-3 max-w-sm" : "flex flex-wrap items-start gap-3";
  const buttonOffset = layout === "row" ? INLINE_BUTTON_OFFSET : "";

  const paymentSelect = (id: string, selectClassName: string) => (
    <PaymentSelect
      id={id}
      selectClassName={selectClassName}
      value={payment.value}
      cardOptions={payment.cardOptions}
      methodOptions={payment.methodOptions}
      cardsError={payment.cardsError}
      onChange={payment.change}
    />
  );
  const accountSelect = (id: string, selectClassName: string) => (
    <AccountSelect
      id={id}
      selectClassName={selectClassName}
      value={values.account_id}
      accounts={accounts}
      lockedByCard={Boolean(payment.selectedCard)}
      onChange={(accountId) => setField("account_id", accountId)}
    />
  );
  const ownerSelect = (selectClassName?: string) =>
    users.length > 1 && (
      <OwnerSelect
        value={values.owner_user_id}
        onChange={(owner) => setField("owner_user_id", owner)}
        users={users}
        selectClassName={selectClassName}
      />
    );

  return (
    <form onSubmit={handleSubmit} className={containerClass}>
      <TransactionTypeToggle
        value={uiType}
        onChange={form.switchType}
        showSavings={Boolean(form.savingsCategory)}
        className={`${isStack ? "w-full" : ""} ${buttonOffset}`}
      />

      {isNew && (
        <TransactionQuickPicks
          uiType={uiType}
          transactionDate={values.transaction_date}
          users={users}
          submitting={submitting}
          onQuickAdd={form.quickAdd}
          onApplyPlanItem={form.applyPlanItem}
        />
      )}

      <AmountInput
        label="금액"
        value={values.amount}
        onChange={(amount) => setField("amount", amount)}
        required
        className={isStack ? "w-full" : "w-32"}
        inputSize={isStack ? "md" : "sm"}
      />

      {uiType !== "savings" &&
        (isStack ? (
          <CategoryChipPicker
            categories={form.kindCategories}
            value={values.category_id}
            onChange={(category_id) => setField("category_id", category_id)}
            recentCategoryIds={form.recentCategoryIds}
            showRequiredError={form.showCategoryError}
          />
        ) : (
          <CategoryPicker
            categories={form.nonSavingsCategories}
            kind={values.type}
            value={values.category_id}
            onChange={(category_id) => setField("category_id", category_id)}
            placeholder="선택"
            required
          />
        ))}
      <FormInput
        label="날짜"
        type="date"
        value={values.transaction_date}
        onChange={(e) => setField("transaction_date", e.target.value)}
        required
        className={isStack ? "w-full" : "w-40"}
      />

      <FormInput
        label="메모"
        type="text"
        value={values.description}
        maxLength={255}
        onChange={(e) => setField("description", e.target.value)}
        className={isStack ? "w-full" : "w-40"}
      />

      {isStack ? (
        <div className="w-full">
          <button
            type="button"
            onClick={() => setShowDetails((s) => !s)}
            aria-expanded={showDetails}
            className={`flex items-center gap-1 ${LABEL_SM} font-medium ${TOUCH_TARGET_MIN_HEIGHT}`}
          >
            상세 입력 (결제 · 계좌 · 소유자)
            {showDetails ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>
          {showDetails && (
            <div className="grid gap-3 mt-1 grid-cols-2">
              {uiType === "expense" && paymentSelect(`${fieldId}-1`, "w-full")}
              {accountSelect(`${fieldId}-0`, "w-full")}
              {ownerSelect()}
            </div>
          )}
        </div>
      ) : (
        <>
          {uiType === "expense" && paymentSelect(`${fieldId}-3`, "w-32")}
          {accountSelect(`${fieldId}-2`, "w-32")}
          {ownerSelect("w-32")}
        </>
      )}

      {uiType === "savings" && (
        <SavingsProductSelect
          id={`${fieldId}-4`}
          selectClassName={isStack ? "w-full" : "w-32"}
          value={values.savings_product_id}
          savingsProducts={savingsProducts}
          onChange={(productId) => setField("savings_product_id", productId)}
        />
      )}

      {isStack ? (
        // 모바일 키보드가 열리면 폼이 시트 높이를 넘겨 맨 아래 버튼이 화면 밖으로 밀린다.
        // 시트의 스크롤 영역 바닥에 붙여 두어 키보드를 닫거나 스크롤하지 않고도 바로 누를 수 있게 한다.
        <div className="sticky bottom-0 w-full -mb-3 pt-3 pb-3 bg-white dark:bg-gray-900 flex gap-2">
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete} disabled={submitting}>
              삭제
            </Button>
          )}
          <Button type="submit" loading={submitting} className="flex-1 justify-center">
            {submitLabel}
          </Button>
        </div>
      ) : (
        <Button type="submit" loading={submitting} className={buttonOffset}>
          {submitLabel}
        </Button>
      )}
    </form>
  );
}

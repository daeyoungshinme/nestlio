import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import Button from "@/components/common/Button";
import CategoryPicker from "@/components/common/CategoryPicker";
import FormInput from "@/components/common/FormInput";
import Tabs from "@/components/common/Tabs";
import { fetchRecentTransactions } from "@/api/transactions";
import { fetchCashflowPlan } from "@/api/cashflowPlan";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { INLINE_BUTTON_OFFSET, INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_COMPACT_MOBILE_ONLY } from "@/constants/uiSizes";
import { EXPENSE_TYPE_FILTER_OPTIONS } from "@/components/transactions/TransactionFilterBar";
import { categoryTypeBadgeStyle } from "@/utils/colors";
import { formatKrw, formatKrwPreview, toAmountInputValue } from "@/utils/format";
import type {
  CategoryOut,
  AccountWithBalanceOut,
  CashflowPlanItemOut,
  SavingsProductOut,
  TransactionCreateIn,
  TransactionOut,
  TransactionType,
  UserOut,
} from "@/types";

const EXPENSE_TYPE_GROUPS = EXPENSE_TYPE_FILTER_OPTIONS.filter(
  (o): o is { value: "fixed" | "variable" | "irregular"; label: string } => o.value !== "all",
);

const QUICK_TABS = ["계획", "최근"] as const;
type QuickTab = (typeof QUICK_TABS)[number];

const QUICK_CHIP_CLASS = `shrink-0 px-3 rounded-full border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${TOUCH_TARGET_COMPACT_MOBILE_ONLY}`;

function QuickChip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={QUICK_CHIP_CLASS}>
      {label}
    </button>
  );
}

function recentChipLabel(tx: TransactionOut): string {
  const parts = [tx.category.name, formatKrw(tx.amount)];
  if (tx.description) parts.push(tx.description);
  return parts.join(" · ");
}

/** "이번 달 계획" 칩 라벨: 계획 항목 이름 · 금액 (· 12개월 분할 회차) (· 소유자, 가구원 2명 이상 & 수입 항목일 때만). */
function planChipLabel(item: CashflowPlanItemOut, users: UserOut[]): string {
  const parts = [item.name, formatKrw(item.amount)];
  if (item.installment_total) parts.push(`${item.installment_no}/${item.installment_total}`);
  if (users.length > 1 && item.owner_user_id) {
    const owner = users.find((u) => u.id === item.owner_user_id);
    if (owner) parts.push(owner.display_name);
  }
  return parts.join(" · ");
}

export interface TransactionFormValues {
  amount: string;
  type: TransactionType;
  category_id: string;
  transaction_date: string;
  description: string;
  payment_method: string;
  account_id: string;
  savings_product_id: string;
  owner_user_id: string;
}

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
}

const today = () => new Date().toISOString().slice(0, 10);

type UiType = "income" | "expense" | "savings";

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
}: Props) {
  const savingsCategory = categories.find((c) => c.is_savings);
  const nonSavingsCategories = categories.filter((c) => !c.is_savings);

  const initialCategory = categories.find((c) => String(c.id) === (initialValues?.category_id ?? ""));
  const [uiType, setUiType] = useState<UiType>(
    initialCategory?.is_savings ? "savings" : (initialValues?.type ?? "expense"),
  );

  const [values, setValues] = useState<TransactionFormValues>({
    amount: initialValues?.amount ? toAmountInputValue(initialValues.amount) : "",
    type: initialValues?.type ?? "expense",
    category_id:
      initialValues?.category_id ??
      String(nonSavingsCategories.find((c) => c.kind === (initialValues?.type ?? "expense"))?.id ?? ""),
    transaction_date: initialValues?.transaction_date ?? today(),
    description: initialValues?.description ?? "",
    payment_method: initialValues?.payment_method ?? "",
    account_id: initialValues?.account_id ?? "",
    savings_product_id: initialValues?.savings_product_id ?? "",
    owner_user_id: initialValues?.owner_user_id ?? (isNew ? (currentUserId ?? "") : ""),
  });

  /** 계좌·소유자 등 부가 필드 접기/펼치기. 이미 값이 있는 상태(수정 모드 포함)로 시작하면 숨겨져 놀라지 않도록 펼친 채로 시작한다. */
  const [showDetails, setShowDetails] = useState(
    () => !isNew || Boolean(initialValues?.account_id || initialValues?.owner_user_id),
  );
  const [quickTab, setQuickTab] = useState<QuickTab>("계획");

  const recentType: TransactionType = uiType === "income" ? "income" : "expense";
  const recentIsSavings = uiType === "savings";
  const recentLimit = uiType === "expense" ? 12 : 8;
  const { data: recentItems } = useQuery({
    queryKey: QUERY_KEYS.recentTransactions({ type: recentType, is_savings: recentIsSavings, limit: recentLimit }),
    queryFn: () => fetchRecentTransactions({ type: recentType, is_savings: recentIsSavings, limit: recentLimit }),
    staleTime: STALE_TIME.SHORT,
    enabled: isNew,
  });

  const recentGroups =
    uiType === "expense"
      ? EXPENSE_TYPE_GROUPS.map((group) => ({
          ...group,
          items: (recentItems ?? []).filter((tx) => tx.category.type === group.value),
        })).filter((group) => group.items.length > 0)
      : [];
  const hasRecentContent = recentGroups.length > 0 || Boolean(recentItems && recentItems.length > 0);

  /** "이번 달 계획" 칩: 폼에서 선택한 거래 날짜가 속한 달의 현금흐름계획 항목 (수입/고정/변동/비정기지출만 — 저축/투자는 계획 개념이 없음). */
  const yearMonth = values.transaction_date.slice(0, 7);
  const { data: planData } = useQuery({
    queryKey: QUERY_KEYS.cashflowPlan(yearMonth),
    queryFn: () => fetchCashflowPlan(yearMonth),
    staleTime: STALE_TIME.SHORT,
    enabled: isNew && uiType !== "savings",
  });
  const planItems = (planData?.items ?? []).filter((item) => Number(item.amount) > 0);
  const planGroups =
    uiType === "expense"
      ? EXPENSE_TYPE_GROUPS.map((group) => ({
          ...group,
          items: planItems.filter((item) => item.section === group.value),
        })).filter((group) => group.items.length > 0)
      : [];
  const planFlatItems = uiType === "income" ? planItems.filter((item) => item.section === "income") : [];
  const hasPlanContent = planGroups.length > 0 || planFlatItems.length > 0;

  const buildPayload = (v: TransactionFormValues, forSavings: boolean): TransactionCreateIn => ({
    amount: v.amount,
    type: v.type,
    category_id: Number(v.category_id),
    transaction_date: v.transaction_date,
    description: v.description || null,
    payment_method: v.payment_method || null,
    account_id: v.account_id ? Number(v.account_id) : null,
    savings_product_id: forSavings && v.savings_product_id ? Number(v.savings_product_id) : null,
    owner_user_id: v.owner_user_id || null,
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(buildPayload(values, uiType === "savings"));
  };

  /** "자주 쓰는 항목" 칩 탭 = 현재 선택된 날짜로 즉시 등록 (탭 1회 = 등록 완료). */
  const quickAdd = (tx: TransactionOut) => {
    onSubmit(
      buildPayload(
        {
          ...values,
          amount: toAmountInputValue(tx.amount),
          type: tx.type,
          category_id: String(tx.category.id),
          description: tx.description ?? "",
          payment_method: tx.payment_method ?? "",
          account_id: tx.account ? String(tx.account.id) : "",
          savings_product_id: tx.savings_product_id ? String(tx.savings_product_id) : "",
        },
        Boolean(tx.savings_product_id),
      ),
    );
  };

  /** "이번 달 계획" 칩 탭 = 폼만 프리필(금액/카테고리/메모/소유자), 즉시 등록하지 않는다.
   * 계획 금액과 실제 지출액이 다를 수 있고, 카테고리 미지정(자유 텍스트) 계획 항목도 있어 자동 등록은 위험하다. */
  const applyPlanItem = (item: CashflowPlanItemOut) => {
    setValues((v) => ({
      ...v,
      amount: toAmountInputValue(item.amount),
      category_id: item.category_id ? String(item.category_id) : v.category_id,
      description: item.name,
      owner_user_id: uiType === "income" ? (item.owner_user_id ?? "") : v.owner_user_id,
    }));
  };

  const isStack = layout === "stack";
  const containerClass = isStack ? "flex flex-col gap-3 max-w-sm" : "flex flex-wrap items-start gap-3";
  const buttonOffset = layout === "row" ? INLINE_BUTTON_OFFSET : "";

  return (
    <form onSubmit={handleSubmit} className={containerClass}>
      <div className={`flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ${buttonOffset}`}>
        {(["expense", "income"] as TransactionType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setUiType(t);
              setValues((v) => ({
                ...v,
                type: t,
                category_id: String(nonSavingsCategories.find((c) => c.kind === t)?.id ?? ""),
                savings_product_id: "",
              }));
            }}
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              uiType === t
                ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-50"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {t === "expense" ? "지출" : "수입"}
          </button>
        ))}
        {savingsCategory && (
          <button
            type="button"
            onClick={() => {
              setUiType("savings");
              setValues((v) => ({
                ...v,
                type: "expense",
                category_id: String(savingsCategory.id),
                savings_product_id: "",
              }));
            }}
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              uiType === "savings"
                ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-50"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            저축/투자
          </button>
        )}
      </div>

      {isNew && uiType === "savings" && recentItems && recentItems.length > 0 && (
        <div className="w-full">
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>자주 쓰는 항목</label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recentItems.map((tx) => (
              <QuickChip key={tx.id} label={recentChipLabel(tx)} disabled={submitting} onClick={() => quickAdd(tx)} />
            ))}
          </div>
        </div>
      )}

      {isNew && uiType !== "savings" && (hasPlanContent || hasRecentContent) && (
        <div className="w-full">
          <Tabs tabs={QUICK_TABS} activeTab={quickTab} onChange={setQuickTab} variant="pill" />
          <div className="mt-2">
            {quickTab === "계획" ? (
              hasPlanContent ? (
                <div className="flex flex-col gap-2">
                  {planGroups.map((group) => (
                    <div key={group.value}>
                      <span
                        className={`inline-block mb-1 px-2 py-0.5 rounded text-[11px] font-medium ${categoryTypeBadgeStyle(group.value)}`}
                      >
                        {group.label}
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {group.items.map((item) => (
                          <QuickChip key={item.id} label={planChipLabel(item, users)} onClick={() => applyPlanItem(item)} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {planFlatItems.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {planFlatItems.map((item) => (
                        <QuickChip key={item.id} label={planChipLabel(item, users)} onClick={() => applyPlanItem(item)} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className={`${LABEL_SM} py-1`}>이번 달 계획에 등록된 항목이 없어요.</p>
              )
            ) : hasRecentContent ? (
              <div className="flex flex-col gap-2">
                {recentGroups.length > 0 ? (
                  recentGroups.map((group) => (
                    <div key={group.value}>
                      <span
                        className={`inline-block mb-1 px-2 py-0.5 rounded text-[11px] font-medium ${categoryTypeBadgeStyle(group.value)}`}
                      >
                        {group.label}
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {group.items.map((tx) => (
                          <QuickChip key={tx.id} label={recentChipLabel(tx)} disabled={submitting} onClick={() => quickAdd(tx)} />
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(recentItems ?? []).map((tx) => (
                      <QuickChip key={tx.id} label={recentChipLabel(tx)} disabled={submitting} onClick={() => quickAdd(tx)} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className={`${LABEL_SM} py-1`}>최근 등록한 내역이 없어요.</p>
            )}
          </div>
        </div>
      )}

      <FormInput
        label="금액"
        type="number"
        inputMode="decimal"
        value={values.amount}
        onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
        required
        className={isStack ? "w-full" : "w-32"}
        inputSize={isStack ? "md" : "sm"}
        preview={Number(values.amount) > 0 ? formatKrwPreview(Number(values.amount)) : undefined}
      />

      {isStack ? (
        <div className={`grid gap-3 w-full ${uiType === "savings" ? "grid-cols-1" : "grid-cols-2"}`}>
          {uiType !== "savings" && (
            <CategoryPicker
              categories={nonSavingsCategories}
              kind={values.type}
              value={values.category_id}
              onChange={(category_id) => setValues((v) => ({ ...v, category_id }))}
              required
              className="w-full"
            />
          )}
          <FormInput
            label="날짜"
            type="date"
            value={values.transaction_date}
            onChange={(e) => setValues((v) => ({ ...v, transaction_date: e.target.value }))}
            required
            className="w-full"
          />
        </div>
      ) : (
        <>
          {uiType !== "savings" && (
            <CategoryPicker
              categories={nonSavingsCategories}
              kind={values.type}
              value={values.category_id}
              onChange={(category_id) => setValues((v) => ({ ...v, category_id }))}
              required
            />
          )}
          <FormInput
            label="날짜"
            type="date"
            value={values.transaction_date}
            onChange={(e) => setValues((v) => ({ ...v, transaction_date: e.target.value }))}
            required
            className="w-40"
          />
        </>
      )}

      <FormInput
        label="메모"
        type="text"
        value={values.description}
        onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        className={isStack ? "w-full" : "w-40"}
      />

      {isStack ? (
        <div className="w-full">
          <button
            type="button"
            onClick={() => setShowDetails((s) => !s)}
            className={`flex items-center gap-1 ${LABEL_SM} font-medium py-1`}
          >
            상세 입력 (계좌 · 소유자)
            {showDetails ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>
          {showDetails && (
            <div className={`grid gap-3 mt-1 ${users.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              <div>
                <label className={`block mb-1 font-medium ${LABEL_SM}`}>계좌</label>
                <select
                  className={`${INPUT_SM} w-full`}
                  value={values.account_id}
                  onChange={(e) => setValues((v) => ({ ...v, account_id: e.target.value }))}
                >
                  <option value="">(선택 안 함)</option>
                  {accounts.map(({ account }) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              {users.length > 1 && (
                <div>
                  <label className={`block mb-1 font-medium ${LABEL_SM}`}>소유자</label>
                  <select
                    className={`${INPUT_SM} w-full`}
                    value={values.owner_user_id}
                    onChange={(e) => setValues((v) => ({ ...v, owner_user_id: e.target.value }))}
                  >
                    <option value="">공통</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div>
            <label className={`block mb-1 font-medium ${LABEL_SM}`}>계좌</label>
            <select
              className={`${INPUT_SM} w-32`}
              value={values.account_id}
              onChange={(e) => setValues((v) => ({ ...v, account_id: e.target.value }))}
            >
              <option value="">(선택 안 함)</option>
              {accounts.map(({ account }) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          {users.length > 1 && (
            <div>
              <label className={`block mb-1 font-medium ${LABEL_SM}`}>소유자</label>
              <select
                className={`${INPUT_SM} w-32`}
                value={values.owner_user_id}
                onChange={(e) => setValues((v) => ({ ...v, owner_user_id: e.target.value }))}
              >
                <option value="">공통</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {uiType === "savings" && (
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>저축상품</label>
          <select
            className={`${INPUT_SM} ${isStack ? "w-full" : "w-32"}`}
            value={values.savings_product_id}
            onChange={(e) => setValues((v) => ({ ...v, savings_product_id: e.target.value }))}
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
      )}

      <Button type="submit" loading={submitting} className={isStack ? "w-full" : buttonOffset}>
        {submitLabel}
      </Button>
    </form>
  );
}

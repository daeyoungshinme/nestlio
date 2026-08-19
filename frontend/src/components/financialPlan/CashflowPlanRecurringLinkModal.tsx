import { useMutation } from "@tanstack/react-query";
import Modal from "@/components/common/Modal";
import RecurringForm, { buildRecurringPayload } from "@/components/transactions/RecurringForm";
import type { RecurringFormValues } from "@/components/transactions/RecurringForm";
import { linkCashflowPlanRecurring } from "@/api/cashflowPlan";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useRecurringMutations } from "@/hooks/useRecurringMutations";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { CashflowPlanItemOut, CategoryOut } from "@/types";

interface Props {
  item: CashflowPlanItemOut;
  /** 반복내역은 수입 카테고리도 골라야 하므로 지출 전용이 아닌 전체 카테고리를 받는다. */
  categories: CategoryOut[];
  onClose: () => void;
  /** 반복내역 생성+연결이 모두 끝난 뒤 호출 — 부모가 현금흐름계획/예산/대시보드 쿼리를 무효화한다. */
  onLinked: () => void;
}

export default function CashflowPlanRecurringLinkModal({ item, categories, onClose, onLinked }: Props) {
  const { createMutation: createRecurringMutation } = useRecurringMutations({
    extraInvalidateKeys: [QUERY_KEYS.eventsAll],
  });
  const linkRecurringMutation = useMutation({
    mutationFn: (vars: { itemId: number; payload: { recurring_expense_id: number } }) =>
      linkCashflowPlanRecurring(vars.itemId, vars.payload),
  });

  const handleSubmit = (values: RecurringFormValues) => {
    createRecurringMutation.mutate(buildRecurringPayload(values), {
      onSuccess: (created) => {
        linkRecurringMutation.mutate(
          // 반복내역 연결 메뉴는 item.id가 있는(이미 저장된) 항목에서만 열리므로 non-null 단언이 안전하다.
          { itemId: item.id!, payload: { recurring_expense_id: created.id } },
          {
            onSuccess: () => {
              onLinked();
              onClose();
              toast("반복내역을 등록하고 계획 항목에 연결했습니다.", "success");
            },
            onError: (err) => {
              onClose();
              toast(
                `반복내역은 등록됐지만 계획 항목 연결에 실패했습니다: ${extractErrorMessage(err)} (반복 내역 관리에서 확인해 주세요)`,
                "error",
              );
            },
          },
        );
      },
    });
  };

  return (
    <Modal onClose={onClose} title="반복내역으로 등록">
      <div className="p-6 overflow-y-auto">
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          등록하면 스케줄러가 매달 자동으로 가계부에 내역을 만들어요. 이후 이 계획 항목의 금액을 고쳐도 반복내역엔
          반영되지 않으니, 금액을 바꾸고 싶으면 "반복 내역 관리"에서 직접 수정해 주세요.
        </p>
        {item.category_id === null && (
          <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
            이 계획 항목엔 카테고리가 없어요. 반복내역 등록에는 카테고리가 꼭 필요하니 아래에서 선택해 주세요.
          </p>
        )}
        <RecurringForm
          categories={categories}
          initial={{
            name: item.name,
            category_id: item.category_id ?? undefined,
            amount: item.amount,
            type: item.section === "income" ? "income" : "expense",
          }}
          submitLabel="등록 후 연결"
          submitting={createRecurringMutation.isPending || linkRecurringMutation.isPending}
          onSubmit={handleSubmit}
        />
      </div>
    </Modal>
  );
}

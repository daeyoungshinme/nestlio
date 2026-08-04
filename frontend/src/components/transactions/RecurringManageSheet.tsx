import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Power } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/common/Modal";
import RowActionButtons from "@/components/common/RowActionButtons";
import RecurringForm from "@/components/transactions/RecurringForm";
import type { RecurringFormValues } from "@/components/transactions/RecurringForm";
import { createRecurring, deactivateRecurring, fetchRecurring, updateRecurring } from "@/api/recurring";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { formatKrw } from "@/utils/format";
import type { CategoryOut, RecurringOut } from "@/types";

const FREQUENCY_LABEL: Record<RecurringOut["frequency"], string> = {
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
};

interface Props {
  categories: CategoryOut[];
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
}

export default function RecurringManageSheet({ categories, dateFrom, dateTo, onClose }: Props) {
  const [formTarget, setFormTarget] = useState<"new" | RecurringOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<RecurringOut | null>(null);

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.recurring, queryFn: fetchRecurring });

  const { createMutation, updateMutation, removeMutation: deactivateMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.recurring, QUERY_KEYS.events(dateFrom, dateTo)],
    api: { create: createRecurring, update: updateRecurring, remove: deactivateRecurring },
    messages: { create: "고정지출을 등록했습니다.", update: "수정했습니다.", remove: "비활성화했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  const handleSubmit = (values: RecurringFormValues) => {
    const payload = {
      name: values.name,
      category_id: Number(values.category_id),
      amount: values.amount,
      frequency: values.frequency,
      start_date: values.start_date,
      end_date: values.end_date || null,
      reminder_days_before: Number(values.reminder_days_before),
    };
    if (formTarget && formTarget !== "new") {
      updateMutation.mutate({ id: formTarget.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <>
      <Modal onClose={onClose} title="고정지출 관리" size="md" closeOnBackdrop>
        <div className="p-4 space-y-3">
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
            고정지출 추가
          </Button>

          {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">불러오는 중...</p>}

          {!isLoading && (data?.items.length ?? 0) === 0 && (
            <EmptyState title="등록된 고정지출이 없습니다" compact />
          )}

          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {data?.items.map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{item.name}</span>
                    <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                      {FREQUENCY_LABEL[item.frequency]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {item.category.name} · {formatKrw(item.amount)} · 다음 예정일 {item.next_due_date}
                  </p>
                </div>
                <RowActionButtons
                  onEdit={() => setFormTarget(item)}
                  onDelete={() => setDeactivateTarget(item)}
                  deleteLabel="비활성화"
                  deleteIcon={<Power size={16} />}
                />
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {formTarget && (
        <Modal
          onClose={() => setFormTarget(null)}
          title={formTarget === "new" ? "고정지출 추가" : "고정지출 수정"}
          size="sm"
          closeOnBackdrop
        >
          <div className="p-4">
            <RecurringForm
              categories={categories}
              initial={formTarget === "new" ? undefined : formTarget}
              submitLabel={formTarget === "new" ? "추가" : "저장"}
              submitting={createMutation.isPending || updateMutation.isPending}
              onSubmit={handleSubmit}
            />
          </div>
        </Modal>
      )}

      {deactivateTarget && (
        <ConfirmModal
          message={`"${deactivateTarget.name}" 고정지출을 비활성화할까요? 더 이상 새 거래가 자동 생성되지 않습니다.`}
          confirmLabel="비활성화"
          onConfirm={() => deactivateMutation.mutate(deactivateTarget.id)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </>
  );
}

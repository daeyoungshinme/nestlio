import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Plus, Power, RotateCcw } from "lucide-react";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/common/Modal";
import RowActionButtons from "@/components/common/RowActionButtons";
import RecurringForm, { buildRecurringPayload } from "@/components/transactions/RecurringForm";
import type { RecurringFormValues } from "@/components/transactions/RecurringForm";
import { fetchRecurring } from "@/api/recurring";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useRecurringMutations } from "@/hooks/useRecurringMutations";
import { transactionTypeBadgeStyle } from "@/utils/colors";
import { formatKrw } from "@/utils/format";
import type { CategoryOut, RecurringOut } from "@/types";

const FREQUENCY_LABEL: Record<RecurringOut["frequency"], string> = {
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
};

function scheduleLabel(item: RecurringOut): string {
  if (item.frequency === "monthly" && item.days_of_month && item.days_of_month.length > 0) {
    return `매월 ${item.days_of_month.join(", ")}일`;
  }
  return FREQUENCY_LABEL[item.frequency];
}

interface Props {
  categories: CategoryOut[];
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
}

function RecurringRow({
  item,
  onEdit,
  action,
}: {
  item: RecurringOut;
  onEdit?: () => void;
  action: { label: string; icon: ReactNode; onClick: () => void };
}) {
  return (
    <div className="py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${transactionTypeBadgeStyle(item.type)}`}
          >
            {item.type === "income" ? "수입" : "지출"}
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{item.name}</span>
          <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{scheduleLabel(item)}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {item.category.name} · {formatKrw(item.amount)} · 다음 예정일 {item.next_due_date}
        </p>
      </div>
      <RowActionButtons
        onEdit={onEdit}
        onDelete={action.onClick}
        deleteLabel={action.label}
        deleteIcon={action.icon}
      />
    </div>
  );
}

export default function RecurringManageSheet({ categories, dateFrom, dateTo, onClose }: Props) {
  const [formTarget, setFormTarget] = useState<"new" | RecurringOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<RecurringOut | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.recurring,
    queryFn: () => fetchRecurring({ include_inactive: true }),
  });

  const {
    createMutation,
    updateMutation,
    removeMutation: deactivateMutation,
    reactivateMutation,
  } = useRecurringMutations({
    extraInvalidateKeys: [QUERY_KEYS.events(dateFrom, dateTo)],
    messages: {
      create: "반복 내역을 등록했습니다.",
      update: "수정했습니다.",
      remove: "비활성화했습니다.",
      reactivate: "다시 활성화했습니다.",
    },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  const handleSubmit = (values: RecurringFormValues) => {
    const payload = buildRecurringPayload(values);
    if (formTarget && formTarget !== "new") {
      updateMutation.mutate({ id: formTarget.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const showingForm = formTarget !== null;
  const activeItems = useMemo(() => (data?.items ?? []).filter((item) => item.is_active), [data]);
  const inactiveItems = useMemo(() => (data?.items ?? []).filter((item) => !item.is_active), [data]);

  return (
    <>
      <Modal
        onClose={onClose}
        title={showingForm ? (formTarget === "new" ? "반복 내역 추가" : "반복 내역 수정") : "반복 내역 관리"}
        size={showingForm ? "sm" : "md"}
        closeOnBackdrop
      >
        {showingForm ? (
          <div className="p-4 overflow-y-auto">
            <button
              type="button"
              onClick={() => setFormTarget(null)}
              className="mb-3 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <ChevronLeft size={16} aria-hidden="true" /> 목록으로
            </button>
            <RecurringForm
              categories={categories}
              initial={formTarget === "new" ? undefined : formTarget}
              submitLabel={formTarget === "new" ? "추가" : "저장"}
              submitting={createMutation.isPending || updateMutation.isPending}
              onSubmit={handleSubmit}
            />
          </div>
        ) : (
          <div className="p-4 space-y-3 overflow-y-auto">
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
              반복 내역 추가
            </Button>

            {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">불러오는 중...</p>}

            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <EmptyState title="등록된 반복 내역이 없습니다" compact />
            )}

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {activeItems.map((item) => (
                <RecurringRow
                  key={item.id}
                  item={item}
                  onEdit={() => setFormTarget(item)}
                  action={{
                    label: "비활성화",
                    icon: <Power size={16} />,
                    onClick: () => setDeactivateTarget(item),
                  }}
                />
              ))}
            </div>

            {inactiveItems.length > 0 && (
              <CollapsibleGroup
                defaultOpen={false}
                header={
                  <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                    중지된 반복 내역 ({inactiveItems.length})
                  </span>
                }
              >
                <div className="divide-y divide-gray-100 dark:divide-gray-800 opacity-60">
                  {inactiveItems.map((item) => (
                    <RecurringRow
                      key={item.id}
                      item={item}
                      action={{
                        label: "재활성화",
                        icon: <RotateCcw size={16} />,
                        onClick: () => reactivateMutation.mutate(item.id),
                      }}
                    />
                  ))}
                </div>
              </CollapsibleGroup>
            )}
          </div>
        )}
      </Modal>

      {deactivateTarget && (
        <ConfirmModal
          message={`"${deactivateTarget.name}" 반복 내역을 비활성화할까요? 더 이상 새 내역이 자동 생성되지 않습니다.`}
          confirmLabel="비활성화"
          onConfirm={() => deactivateMutation.mutate(deactivateTarget.id)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </>
  );
}

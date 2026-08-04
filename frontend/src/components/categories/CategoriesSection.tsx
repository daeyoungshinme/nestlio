import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import Badge from "@/components/common/Badge";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import RowActionButtons from "@/components/common/RowActionButtons";
import SkeletonCard from "@/components/common/SkeletonCard";
import { INLINE_BUTTON_OFFSET, INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { createCategory, deactivateCategory, fetchCategories, updateCategory } from "@/api/categories";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import type { CategoryOut, CategoryType } from "@/types";

const TYPE_LABEL: Record<CategoryType, string> = {
  fixed: "고정지출",
  variable: "변동지출",
  irregular: "비정기지출",
};

const TYPE_ORDER: CategoryType[] = ["fixed", "variable", "irregular"];

interface FormState {
  name: string;
  kind: "income" | "expense";
  type: CategoryType;
  color: string;
}

const emptyForm: FormState = { name: "", kind: "expense", type: "variable", color: "#888888" };

export default function CategoriesSection() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<CategoryOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<CategoryOut | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.categories(),
    queryFn: () => fetchCategories(),
    staleTime: STALE_TIME.LONG,
  });

  const { createMutation, updateMutation, removeMutation: deactivateMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.categoriesAll, QUERY_KEYS.transactionsAll, QUERY_KEYS.categoryBreakdownAll],
    api: { create: createCategory, update: updateCategory, remove: deactivateCategory },
    messages: {
      create: "카테고리를 추가했습니다.",
      update: "카테고리를 수정했습니다.",
      remove: "카테고리를 비활성화했습니다.",
    },
    onCreateSuccess: () => setForm(emptyForm),
    onUpdateSuccess: () => setEditing(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    updateMutation.mutate({ id: editing.id, payload: { name: editing.name, kind: editing.kind, type: editing.type, color: editing.color } });
  };

  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  const expenseByType = TYPE_ORDER.map((type) => ({
    type,
    items: data.filter((c) => c.kind === "expense" && c.type === type && !c.is_savings),
  }));
  const incomeCategories = data.filter((c) => c.kind === "income" && !c.is_savings);

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">새 카테고리 추가</h3>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-3">
          <FormInput
            label="이름"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            className="w-32"
          />
          <div>
            <label className={`block mb-1 font-medium ${LABEL_SM}`}>종류</label>
            <select
              className={`${INPUT_SM} w-24`}
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as "income" | "expense" }))}
            >
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
          </div>
          <div>
            <label className={`block mb-1 font-medium ${LABEL_SM}`}>구분</label>
            <select
              className={`${INPUT_SM} w-28`}
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CategoryType }))}
            >
              {TYPE_ORDER.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={`block mb-1 font-medium ${LABEL_SM}`}>색상</label>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className="w-12 h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            />
          </div>
          <Button type="submit" loading={createMutation.isPending} className={INLINE_BUTTON_OFFSET}>
            추가
          </Button>
        </form>
      </div>

      {data.length === 0 ? (
        <EmptyState title="등록된 카테고리가 없어요" compact />
      ) : (
        <div className="space-y-5">
          {expenseByType.map(({ type, items }) =>
            items.length === 0 ? null : (
              <div key={type} className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400">{TYPE_LABEL[type]}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((category) => (
                    <CategoryCard
                      key={category.id}
                      category={category}
                      onEdit={() => setEditing(category)}
                      onDeactivate={() => setDeactivateTarget(category)}
                    />
                  ))}
                </div>
              </div>
            ),
          )}

          {incomeCategories.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400">수입</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {incomeCategories.map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    onEdit={() => setEditing(category)}
                    onDeactivate={() => setDeactivateTarget(category)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} title="카테고리 수정">
          <div className="p-6 overflow-y-auto">
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-3 max-w-sm">
              <FormInput
                label="이름"
                value={editing.name}
                onChange={(e) => setEditing((c) => (c ? { ...c, name: e.target.value } : c))}
                required
              />
              <div>
                <label className={`block mb-1 font-medium ${LABEL_SM}`}>종류</label>
                <select
                  className={`${INPUT_SM} w-full`}
                  value={editing.kind}
                  onChange={(e) => setEditing((c) => (c ? { ...c, kind: e.target.value as "income" | "expense" } : c))}
                >
                  <option value="expense">지출</option>
                  <option value="income">수입</option>
                </select>
              </div>
              <div>
                <label className={`block mb-1 font-medium ${LABEL_SM}`}>구분</label>
                <select
                  className={`${INPUT_SM} w-full`}
                  value={editing.type}
                  onChange={(e) => setEditing((c) => (c ? { ...c, type: e.target.value as CategoryType } : c))}
                >
                  {TYPE_ORDER.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`block mb-1 font-medium ${LABEL_SM}`}>색상</label>
                <input
                  type="color"
                  value={editing.color}
                  onChange={(e) => setEditing((c) => (c ? { ...c, color: e.target.value } : c))}
                  className="w-12 h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                />
              </div>
              <Button type="submit" loading={updateMutation.isPending}>
                저장
              </Button>
            </form>
          </div>
        </Modal>
      )}

      {deactivateTarget && (
        <ConfirmModal
          message={`"${deactivateTarget.name}" 카테고리를 비활성화할까요?`}
          onConfirm={() => deactivateMutation.mutate(deactivateTarget.id)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}

function CategoryCard({
  category,
  onEdit,
  onDeactivate,
}: {
  category: CategoryOut;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return (
    <div className="card flex items-center justify-between gap-3">
      <div className="min-w-0 flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: category.color }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{category.name}</p>
          <Badge type={category.type} label={category.kind === "income" ? "수입" : TYPE_LABEL[category.type]} />
        </div>
      </div>
      <RowActionButtons onEdit={onEdit} onDelete={onDeactivate} deleteLabel="비활성화" />
    </div>
  );
}

import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import QueryBoundary from "@/components/common/QueryBoundary";
import CategoryCard from "@/components/categories/CategoryCard";
import CategoryFormModal from "@/components/categories/CategoryFormModal";
import { CATEGORY_TYPE_LABEL, CATEGORY_TYPE_ORDER } from "@/components/categories/categoryTypes";
import { createCategory, deactivateCategory, updateCategory } from "@/api/categories";
import { CATEGORY_RELATED_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { useCategories } from "@/hooks/useReferenceData";
import type { CategoryOut } from "@/types";

export default function CategoriesSection() {
  /** 열린 폼 — "new"면 추가, 카테고리면 수정. */
  const [formTarget, setFormTarget] = useState<"new" | CategoryOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<CategoryOut | null>(null);

  const categoriesQuery = useCategories();

  const { createMutation, updateMutation, removeMutation: deactivateMutation } = useCrudMutations({
    // 카테고리 이름/색/활성 여부가 박힌 응답 전부(목록은 CATEGORY_RELATED_KEYS 주석 참고).
    invalidateKeys: CATEGORY_RELATED_KEYS,
    api: { create: createCategory, update: updateCategory, remove: deactivateCategory },
    messages: {
      create: "카테고리를 추가했습니다.",
      update: "카테고리를 수정했습니다.",
      remove: "카테고리를 비활성화했습니다.",
    },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  return (
    <div className="space-y-6">
      {/* 예전엔 6칸짜리 추가 폼이 목록 위에 늘 펼쳐져 있어 모바일에서 목록이 한 화면 아래로 밀렸다. */}
      <div className="flex justify-end">
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
          카테고리 추가
        </Button>
      </div>

      {/* 실패를 끝없는 스켈레톤으로 두지 않는다 — 추가 버튼은 목록 조회와 무관하게 남긴다. */}
      <QueryBoundary query={categoriesQuery} errorMessage="카테고리를 불러오지 못했어요">
        {(data) =>
          data.length === 0 ? (
            <EmptyState title="등록된 카테고리가 없어요" compact />
          ) : (
            <div className="space-y-5">
              {groupCategories(data).map(({ key, label, items }) =>
                items.length === 0 ? null : (
                  <div key={key} className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {items.map((category) => (
                        <CategoryCard
                          key={category.id}
                          category={category}
                          onEdit={() => setFormTarget(category)}
                          onDeactivate={() => setDeactivateTarget(category)}
                        />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )
        }
      </QueryBoundary>

      {formTarget && (
        <CategoryFormModal
          category={formTarget === "new" ? null : formTarget}
          submitting={formTarget === "new" ? createMutation.isPending : updateMutation.isPending}
          onClose={() => setFormTarget(null)}
          onSubmit={(payload) =>
            formTarget === "new"
              ? createMutation.mutate(payload)
              : updateMutation.mutate({ id: formTarget.id, payload })
          }
        />
      )}

      {deactivateTarget && (
        <ConfirmModal
          message={`"${deactivateTarget.name}" 카테고리를 비활성화할까요?`}
          loading={deactivateMutation.isPending}
          onConfirm={() => deactivateMutation.mutate(deactivateTarget.id)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}

/** 지출은 고정/변동/비정기 순, 그다음 수입 — 저축 카테고리는 관리 화면에서 숨긴다. */
function groupCategories(data: CategoryOut[]) {
  return [
    ...CATEGORY_TYPE_ORDER.map((type) => ({
      key: type,
      label: CATEGORY_TYPE_LABEL[type],
      items: data.filter((c) => c.kind === "expense" && c.type === type && !c.is_savings),
    })),
    { key: "income", label: "수입", items: data.filter((c) => c.kind === "income" && !c.is_savings) },
  ];
}

import Badge from "@/components/common/Badge";
import RowActionButtons from "@/components/common/RowActionButtons";
import { CATEGORY_TYPE_LABEL } from "@/components/categories/categoryTypes";
import { BENCHMARK_GROUP_LABELS } from "@/constants/benchmarkGroups";
import type { CategoryOut } from "@/types";

export default function CategoryCard({
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
          <div className="flex items-center gap-1 flex-wrap">
            <Badge type={category.type} label={category.kind === "income" ? "수입" : CATEGORY_TYPE_LABEL[category.type]} />
            {category.benchmark_group && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {BENCHMARK_GROUP_LABELS[category.benchmark_group]}
              </span>
            )}
          </div>
        </div>
      </div>
      <RowActionButtons onEdit={onEdit} onDelete={onDeactivate} deleteLabel="비활성화" />
    </div>
  );
}

import type { CategoryOut } from "@/types";

interface CategorizedItem {
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
}

export interface CategoryGroup<T extends CategorizedItem> {
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  items: T[];
}

/** 항목들을 category_id 기준으로 묶는다. 그룹 순서는 categoryOrder(예: /categories와 동일한
 * sort_order 순 목록)에 등장하는 순서를 따르고, categoryOrder에 없는 카테고리는 등장 순으로
 * 뒤에 붙는다. 미분류(category_id === null) 그룹은 항상 마지막이다. */
export function groupItemsByCategory<T extends CategorizedItem>(
  items: T[],
  categoryOrder: CategoryOut[],
): CategoryGroup<T>[] {
  const rank = new Map(categoryOrder.map((c, i) => [c.id, i]));
  const buckets = new Map<number | null, T[]>();
  for (const item of items) {
    const key = item.category_id;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const categorized: { key: number; order: number }[] = [];
  let fallbackOrder = rank.size;
  for (const key of buckets.keys()) {
    if (key === null) continue;
    const order = rank.get(key) ?? fallbackOrder++;
    categorized.push({ key, order });
  }
  categorized.sort((a, b) => a.order - b.order);

  const groups: CategoryGroup<T>[] = categorized.map(({ key }) => {
    const groupItems = buckets.get(key)!;
    const first = groupItems[0];
    return {
      category_id: key,
      category_name: first.category_name,
      category_color: first.category_color,
      items: groupItems,
    };
  });

  const uncategorized = buckets.get(null);
  if (uncategorized) {
    groups.push({ category_id: null, category_name: null, category_color: null, items: uncategorized });
  }

  return groups;
}

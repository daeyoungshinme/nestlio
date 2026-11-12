import { Flag } from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import { todoPriorityBadgeClass } from "@/utils/colors";
import { TODO_PRIORITY_LABEL } from "@/utils/todos";
import type { TodoPriority } from "@/types";

/** 할일 우선순위 배지 — 깃발 아이콘으로 기한 배지와 모양을 구분한다. 보통이면 그리지 않는다. */
export default function TodoPriorityBadge({ priority }: { priority: TodoPriority }) {
  if (priority === "normal") return null;
  return (
    <StatusBadge
      label={TODO_PRIORITY_LABEL[priority]}
      icon={<Flag size={12} aria-hidden="true" />}
      toneClassName={todoPriorityBadgeClass(priority)}
    />
  );
}

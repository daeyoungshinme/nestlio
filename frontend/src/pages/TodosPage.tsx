import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Plus } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import QueryBoundary from "@/components/common/QueryBoundary";
import Tabs from "@/components/common/Tabs";
import TodoRow from "@/components/todos/TodoRow";
import { fetchTodos } from "@/api/todos";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { TODO_TABS, type TodoTab } from "@/constants/routes";
import { useMe, useUsers } from "@/hooks/useReferenceData";
import { useTodoActions } from "@/hooks/useTodoActions";
import { currentDateIso } from "@/utils/date";
import { filterTodosByAssignee, TODO_ASSIGNEE_FILTERS, type TodoAssigneeFilter } from "@/utils/todos";

function isTab(value: string | null): value is TodoTab {
  return (TODO_TABS as readonly string[]).includes(value ?? "");
}

/** 부부 할일 — 서로 등록하고 맡기고 함께 체크한다. 주 메뉴에 없고 홈의 "우리 할일" 카드에서 들어온다. */
export default function TodosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TodoTab = isTab(tabParam) ? tabParam : "진행 중";
  const status = activeTab === "완료" ? "done" : "open";
  const [assigneeFilter, setAssigneeFilter] = useState<TodoAssigneeFilter>("전체");
  const today = currentDateIso();

  const { data: users } = useUsers();
  const { data: me } = useMe();
  const todosQuery = useQuery({
    queryKey: QUERY_KEYS.todos(status),
    queryFn: () => fetchTodos(status),
  });
  const { openCreate, openEdit, openDelete, toggleComplete, modals } = useTodoActions({ users });

  const changeTab = (tab: TodoTab) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-4">
      <Tabs tabs={TODO_TABS} activeTab={activeTab} onChange={changeTab} variant="pill" fullWidth />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs tabs={TODO_ASSIGNEE_FILTERS} activeTab={assigneeFilter} onChange={setAssigneeFilter} variant="pill" />
        <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>
          할일 추가
        </Button>
      </div>

      <QueryBoundary query={todosQuery} errorMessage="할일을 불러오지 못했어요.">
        {(todos) => {
          const filtered = filterTodosByAssignee(todos, assigneeFilter, me?.id);
          if (filtered.length === 0) {
            return (
              <EmptyState
                icon={ListChecks}
                title={
                  assigneeFilter === "전체"
                    ? activeTab === "완료"
                      ? "완료한 할일이 없어요"
                      : "진행 중인 할일이 없어요"
                    : `${assigneeFilter} 담당 할일이 없어요`
                }
              />
            );
          }
          return (
            <div className="space-y-2">
              {filtered.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  today={today}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  onToggleComplete={toggleComplete}
                />
              ))}
              {activeTab === "완료" && (
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">최근 완료한 50개까지 보여요.</p>
              )}
            </div>
          );
        }}
      </QueryBoundary>

      {modals}
    </div>
  );
}

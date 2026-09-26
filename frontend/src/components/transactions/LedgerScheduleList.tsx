import { useState } from "react";
import Tabs from "@/components/common/Tabs";
import ScheduleMonthList from "@/components/schedule/ScheduleMonthList";
import type { EventOut, UserOut } from "@/types";

const ALL_ASSIGNEES_TAB = "전체";
const SHARED_ASSIGNEE_TAB = "공동";

interface Props {
  events: EventOut[];
  users: UserOut[] | undefined;
  onEdit: (event: EventOut) => void;
  onDelete: (event: EventOut) => void;
  onToggleComplete: (event: EventOut) => void;
}

/** 가계부 "일정" 보기의 목록 — 담당자(나/배우자/공동) 필터 + 이번 달 일정의 날짜별 접이식 목록. 구 `/schedule`
 * 페이지의 캘린더 아래 영역을 옮긴 것이다(캘린더는 가계부 캘린더가 거래·일정을 함께 보여주므로 공유한다). */
export default function LedgerScheduleList({ events, users, onEdit, onDelete, onToggleComplete }: Props) {
  const [assigneeTab, setAssigneeTab] = useState(ALL_ASSIGNEES_TAB);
  const assigneeTabs = [ALL_ASSIGNEES_TAB, ...(users?.map((u) => u.display_name) ?? []), SHARED_ASSIGNEE_TAB];
  const assigneeFilterId =
    assigneeTab === ALL_ASSIGNEES_TAB
      ? undefined
      : assigneeTab === SHARED_ASSIGNEE_TAB
        ? null
        : users?.find((u) => u.display_name === assigneeTab)?.id;
  const filtered =
    assigneeFilterId === undefined ? events : events.filter((e) => (e.assignee?.id ?? null) === assigneeFilterId);

  return (
    <div className="space-y-3">
      <Tabs tabs={assigneeTabs} activeTab={assigneeTab} onChange={setAssigneeTab} variant="pill" />
      <ScheduleMonthList events={filtered} onEdit={onEdit} onDelete={onDelete} onToggleComplete={onToggleComplete} />
    </div>
  );
}

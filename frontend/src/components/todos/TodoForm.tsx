import { useId, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import OwnerSelect from "@/components/common/OwnerSelect";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { TODO_FREQUENCY_LABEL } from "@/utils/todos";
import type { TodoCreateIn, TodoFrequency, TodoOut, UserOut } from "@/types";

const FREQUENCIES = Object.keys(TODO_FREQUENCY_LABEL) as TodoFrequency[];

interface Props {
  /** 없으면 새 할일. */
  todo?: TodoOut;
  submitLabel: string;
  submitting?: boolean;
  users?: UserOut[];
  onSubmit: (payload: TodoCreateIn) => void;
}

export default function TodoForm({ todo, submitLabel, submitting, users, onSubmit }: Props) {
  const fieldId = useId();
  const [title, setTitle] = useState(todo?.title ?? "");
  const [assigneeId, setAssigneeId] = useState(todo?.assignee?.id ?? "");
  const [eachCompletes, setEachCompletes] = useState(todo?.each_completes ?? false);
  const [important, setImportant] = useState(todo?.is_important ?? false);
  const [dueDate, setDueDate] = useState(todo?.due_date ?? "");
  const [frequency, setFrequency] = useState<TodoFrequency>(todo?.frequency ?? "once");
  const [memo, setMemo] = useState(todo?.memo ?? "");

  const changeDueDate = (value: string) => {
    setDueDate(value);
    // 반복은 기한을 기준으로 다음 회차를 잡으므로 기한을 지우면 반복도 없앤다(백엔드도 422로 막는다).
    if (!value) setFrequency("once");
  };

  const changeAssignee = (value: string) => {
    setAssigneeId(value);
    // 각자 완료는 공동 할일에만 의미가 있다(백엔드도 422로 막는다).
    if (value) setEachCompletes(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      memo: memo || null,
      due_date: dueDate || null,
      frequency,
      assignee_id: assigneeId || null,
      each_completes: eachCompletes,
      is_important: important,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormInput label="할일" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required />
      <label className={`${TOUCH_TARGET_MIN_HEIGHT} -mt-2 flex cursor-pointer items-center gap-2 ${LABEL_SM}`}>
        <input
          type="checkbox"
          checked={important}
          onChange={(e) => setImportant(e.target.checked)}
          className="h-4 w-4 rounded-sm border-gray-300"
        />
        중요해요
      </label>
      <div className="space-y-1">
        <OwnerSelect label="담당자" value={assigneeId} onChange={changeAssignee} users={users} />
        <label className={`${TOUCH_TARGET_MIN_HEIGHT} flex items-center gap-2 ${LABEL_SM} ${assigneeId ? "opacity-50" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            checked={eachCompletes}
            disabled={!!assigneeId}
            onChange={(e) => setEachCompletes(e.target.checked)}
            className="h-4 w-4 rounded-sm border-gray-300"
          />
          각자 완료해야 해요
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {assigneeId ? "담당자가 공통일 때만 고를 수 있어요." : "켜면 두 사람이 각자 체크해야 완료돼요."}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <FormInput
          label="기한 (선택)"
          type="date"
          value={dueDate}
          onChange={(e) => changeDueDate(e.target.value)}
          className="w-40"
        />
        <div>
          <label htmlFor={`${fieldId}-frequency`} className={`block mb-1 font-medium ${LABEL_SM}`}>
            반복
          </label>
          <select
            id={`${fieldId}-frequency`}
            className={`${INPUT_SM} w-32 disabled:opacity-50`}
            value={frequency}
            disabled={!dueDate}
            onChange={(e) => setFrequency(e.target.value as TodoFrequency)}
          >
            {FREQUENCIES.map((value) => (
              <option key={value} value={value}>
                {TODO_FREQUENCY_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!dueDate && <p className="text-xs text-gray-500 dark:text-gray-400">반복하려면 기한을 먼저 정해주세요.</p>}
      <div>
        <label htmlFor={`${fieldId}-memo`} className={`block mb-1 font-medium ${LABEL_SM}`}>
          메모 (선택)
        </label>
        <textarea
          id={`${fieldId}-memo`}
          className={`w-full ${INPUT_SM}`}
          rows={2}
          value={memo}
          maxLength={1000}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={submitting || !title.trim()}>
        {submitLabel}
      </Button>
    </form>
  );
}

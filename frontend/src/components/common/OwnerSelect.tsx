import { useId } from "react";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import type { UserOut } from "@/types";

interface Props {
  value: string;
  onChange: (value: string) => void;
  users: UserOut[] | undefined;
  label?: string;
  /** 기본 w-full. 인라인 레이아웃에서 폭을 좁혀야 할 때만 넘긴다 (예: "w-32"). */
  selectClassName?: string;
}

/** 계좌/저축상품/부동산/대출/일정/현금흐름·연간계획 폼이 공통으로 쓰는 소유자·담당자 선택 select. */
export default function OwnerSelect({
  value,
  onChange,
  users,
  label = "소유자",
  selectClassName = "w-full",
}: Props) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={`block mb-1 font-medium ${LABEL_SM}`}>
        {label}
      </label>
      <select
        id={id}
        className={`${INPUT_SM} ${selectClassName}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">공통</option>
        {users?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.display_name}
          </option>
        ))}
      </select>
    </div>
  );
}

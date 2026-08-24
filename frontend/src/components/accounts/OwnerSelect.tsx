import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import type { UserOut } from "@/types";

interface Props {
  value: string;
  onChange: (value: string) => void;
  users: UserOut[] | undefined;
  label?: string;
}

/** 계좌/저축상품/부동산/대출/일정 폼이 공통으로 쓰는 소유자·담당자 선택 select. */
export default function OwnerSelect({ value, onChange, users, label = "소유자" }: Props) {
  return (
    <div>
      <label className={`block mb-1 font-medium ${LABEL_SM}`}>{label}</label>
      <select className={`${INPUT_SM} w-full`} value={value} onChange={(e) => onChange(e.target.value)}>
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

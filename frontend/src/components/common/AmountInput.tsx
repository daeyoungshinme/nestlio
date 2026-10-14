import type { ChangeEvent, ComponentProps } from "react";
import FormInput from "@/components/common/FormInput";
import { amountInputPreview } from "@/utils/format";

type Props = Omit<ComponentProps<typeof FormInput>, "type" | "inputMode" | "value" | "onChange" | "preview"> & {
  /** 콤마 없는 숫자 문자열("125000"). 비어 있으면 "". */
  value: string;
  onChange: (value: string) => void;
};

/** 입력값에서 숫자와 소수점 하나만 남긴다. 붙여넣은 "1,250,000원"도 "1250000"이 된다.
 * 소수점은 레거시 행("12345.5")을 수정할 때 값이 잘리지 않게 하려고만 허용한다(숫자 키패드엔 없다). */
export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  const [intPart, fracPart] =
    dot === -1 ? [cleaned, null] : [cleaned.slice(0, dot), cleaned.slice(dot + 1).replace(/\./g, "")];
  const int = intPart.replace(/^0+(?=\d)/, "");
  return fracPart === null ? int : `${int || "0"}.${fracPart}`;
}

/** "1250000" → "1,250,000". 문자열 그대로 다뤄 큰 금액에서도 Number 정밀도 손실이 없다. */
export function formatAmountInput(value: string): string {
  const [int, frac] = value.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === undefined ? grouped : `${grouped}.${frac}`;
}

const isAmountChar = (ch: string) => /[0-9.]/.test(ch);

/** KRW 금액 입력칸 — 숫자 키패드(`inputMode="numeric"`)를 띄우고 입력 중에 천 단위 콤마를 보여준다.
 * `type="number"` + `inputMode="decimal"`은 원화에 필요 없는 "." 키를 띄우고 e/+/-를 받으며 콤마를
 * 못 보여줘 0 하나 차이 오타를 놓치기 쉽다. 값은 콤마 없는 문자열로 주고받는다. */
export default function AmountInput({ value, onChange, ...rest }: Props) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const caret = input.selectionStart ?? input.value.length;
    // 커서 앞에 있던 숫자 개수를 기억했다가 콤마가 다시 그려진 뒤 같은 자리로 되돌린다
    // (중간을 고칠 때 커서가 끝으로 튀지 않게).
    const digitsBeforeCaret = Array.from(input.value.slice(0, caret)).filter(isAmountChar).length;
    const next = sanitizeAmountInput(input.value);
    onChange(next);
    requestAnimationFrame(() => {
      if (document.activeElement !== input) return;
      const formatted = input.value;
      let pos = 0;
      let seen = 0;
      while (pos < formatted.length && seen < digitsBeforeCaret) {
        if (isAmountChar(formatted[pos])) seen++;
        pos++;
      }
      input.setSelectionRange(pos, pos);
    });
  };

  return (
    <FormInput
      {...rest}
      type="text"
      inputMode="numeric"
      pattern="[0-9,.]*"
      autoComplete="off"
      enterKeyHint="done"
      value={formatAmountInput(value)}
      onChange={handleChange}
      preview={amountInputPreview(value)}
    />
  );
}

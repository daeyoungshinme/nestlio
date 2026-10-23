import type { ChangeEvent, ComponentProps } from "react";
import FormInput from "@/components/common/FormInput";
import { LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { amountInputPreview, formatKrwPreview } from "@/utils/format";

type Props = Omit<ComponentProps<typeof FormInput>, "type" | "inputMode" | "value" | "onChange" | "preview"> & {
  /** 콤마 없는 숫자 문자열("125000"). 비어 있으면 "". */
  value: string;
  onChange: (value: string) => void;
  /** 마이너스가 정상인 값(마이너스통장 잔액 등). 숫자 키패드엔 "-" 키가 없어 부호 전환 버튼을 함께 그린다. */
  allowNegative?: boolean;
  /** 기본 미리보기("1,250,000원 (125만원)") 대신 보여줄 문구. */
  preview?: string;
};

/** 입력값에서 숫자와 소수점 하나만 남긴다. 붙여넣은 "1,250,000원"도 "1250000"이 된다.
 * 소수점은 레거시 행("12345.5")을 수정할 때 값이 잘리지 않게 하려고만 허용한다(숫자 키패드엔 없다).
 * `allowNegative`면 맨 앞의 "-" 하나는 남긴다. */
export function sanitizeAmountInput(raw: string, allowNegative = false): string {
  const negative = allowNegative && raw.trim().startsWith("-");
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  const [intPart, fracPart] =
    dot === -1 ? [cleaned, null] : [cleaned.slice(0, dot), cleaned.slice(dot + 1).replace(/\./g, "")];
  const int = intPart.replace(/^0+(?=\d)/, "");
  const unsigned = fracPart === null ? int : `${int || "0"}.${fracPart}`;
  return negative ? `-${unsigned}` : unsigned;
}

/** "1250000" → "1,250,000". 문자열 그대로 다뤄 큰 금액에서도 Number 정밀도 손실이 없다. */
export function formatAmountInput(value: string): string {
  const sign = value.startsWith("-") ? "-" : "";
  const [int, frac] = value.slice(sign.length).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return sign + (frac === undefined ? grouped : `${grouped}.${frac}`);
}

/** 부호만 뒤집는다(빈 값·0은 그대로). */
export function toggleAmountSign(value: string): string {
  if (value.startsWith("-")) return value.slice(1);
  return value === "" || Number(value) === 0 ? value : `-${value}`;
}

const isAmountChar = (ch: string) => /[0-9.-]/.test(ch);

/** 라벨·미리보기를 직접 그리는 격자형 입력(월별 금액 등)용 — `<input {...amountInputProps(v, set)} />`.
 * `AmountInput`과 같은 키패드·콤마·커서 보정. 훅이 아니라 map 안에서도 부를 수 있다. */
export function amountInputProps(value: string, onChange: (value: string) => void, allowNegative = false) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const caret = input.selectionStart ?? input.value.length;
    // 커서 앞에 있던 숫자 개수를 기억했다가 콤마가 다시 그려진 뒤 같은 자리로 되돌린다
    // (중간을 고칠 때 커서가 끝으로 튀지 않게).
    const digitsBeforeCaret = Array.from(input.value.slice(0, caret)).filter(isAmountChar).length;
    onChange(sanitizeAmountInput(input.value, allowNegative));
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
  return {
    type: "text",
    inputMode: "numeric",
    pattern: "-?[0-9,.]*",
    autoComplete: "off",
    enterKeyHint: "done",
    value: formatAmountInput(value),
    onChange: handleChange,
  } as const;
}

function signedPreview(value: string): string | undefined {
  if (!value.startsWith("-")) return amountInputPreview(value);
  const n = Number(value.slice(1));
  return n > 0 ? `마이너스 ${formatKrwPreview(n)}` : undefined;
}

/** KRW 금액 입력칸 — 숫자 키패드(`inputMode="numeric"`)를 띄우고 입력 중에 천 단위 콤마를 보여준다.
 * `type="number"` + `inputMode="decimal"`은 원화에 필요 없는 "." 키를 띄우고 e/+/-를 받으며 콤마를
 * 못 보여줘 0 하나 차이 오타를 놓치기 쉽다. 값은 콤마 없는 문자열로 주고받는다. */
export default function AmountInput({ value, onChange, allowNegative = false, preview, ...rest }: Props) {
  const input = (
    <FormInput
      {...rest}
      {...amountInputProps(value, onChange, allowNegative)}
      preview={preview ?? signedPreview(value)}
    />
  );
  if (!allowNegative) return input;
  const negative = value.startsWith("-");
  return (
    <div>
      {input}
      <button
        type="button"
        aria-pressed={negative}
        onClick={() => onChange(toggleAmountSign(value))}
        className={`${TOUCH_TARGET_MIN_HEIGHT} ${LABEL_SM} font-medium underline-offset-2 hover:underline`}
      >
        {negative ? "플러스 금액으로 바꾸기" : "마이너스 금액으로 바꾸기"}
      </button>
    </div>
  );
}

import { TOUCH_TARGET_MIN } from "@/constants/uiSizes";

/** 할일·일정 행의 완료 체크박스. 체크박스 자체는 작아도 감싼 label이 44px라 엄지로 누르기 쉽다(행 왼쪽 여백만큼
 * 당겨 둔다). */
export default function CompleteCheckbox({
  checked,
  onToggle,
  title,
}: {
  checked: boolean;
  onToggle: () => void;
  /** 접근성 이름 "{title} 완료 처리"에 쓴다. */
  title: string;
}) {
  return (
    <label className={`${TOUCH_TARGET_MIN} -ml-3 shrink-0 cursor-pointer`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-5 w-5 rounded-sm border-gray-300"
        aria-label={`${title} 완료 처리`}
      />
    </label>
  );
}

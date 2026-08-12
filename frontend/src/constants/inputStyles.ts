const BASE =
  "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 " +
  "text-gray-900 dark:text-gray-50 rounded-lg " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500";

export const INPUT_SM = BASE + " px-3 py-2 text-sm min-h-[44px]";
export const INPUT_MD = BASE + " px-3 py-2.5 text-base min-h-[44px]";
export const LABEL_SM = "text-xs text-gray-500 dark:text-gray-400";
export const LABEL_MD = "text-sm font-medium text-gray-700 dark:text-gray-300";
export const SELECT_SM = INPUT_SM;
export const TEXTAREA_SM = INPUT_SM + " resize-none";

export const FORM_LABEL = `block ${LABEL_MD} mb-1`;
export const HINT_TEXT = "text-xs text-gray-400 dark:text-gray-500";

/** 긴 폼을 여러 논리적 그룹으로 나눌 때 쓰는 섹션 소제목 (예: 재무목표 폼의 "기본 정보"/"저축 계획"). */
export const FORM_SECTION_LABEL =
  "text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide pt-3 mt-1 border-t border-gray-100 dark:border-gray-800 first:border-0 first:pt-0 first:mt-0";

/** items-start 행에서, 라벨 없는 Button/아이콘 버튼을 FormInput의 라벨 높이(≈20px)만큼 내려
 *  인풋과 눈높이를 맞출 때 사용 */
export const INLINE_BUTTON_OFFSET = "mt-5";

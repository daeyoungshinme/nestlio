import { Search, X } from "lucide-react";
import { INPUT_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_MIN } from "@/constants/uiSizes";

/** 가계부 거래 검색창 — 한 달 목록 위 컨트롤 바(`LedgerListControls`)와, 검색 중 날짜를 골랐을 때 날짜 상세 위에 쓴다. */
export default function LedgerSearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative flex-1">
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
        placeholder="메모나 카테고리로 검색"
        aria-label="거래 내역 검색"
        className={`${INPUT_SM} w-full pl-9 ${value ? "pr-11" : ""}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="검색어 지우기"
          className={`absolute right-0 top-1/2 -translate-y-1/2 ${TOUCH_TARGET_MIN} text-gray-400 hover:text-gray-600 dark:hover:text-gray-300`}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

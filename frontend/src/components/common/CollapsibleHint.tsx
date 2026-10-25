import { useState } from "react";
import type { ReactNode } from "react";

interface Props {
  /** 항상 보이는 한 줄 요약. */
  summary: ReactNode;
  /** 모바일에선 "자세히"를 눌러야 보이고 sm 이상에선 늘 보이는 나머지 설명. */
  children: ReactNode;
  className?: string;
}

/** 화면 아래의 긴 안내 문단용 — 모바일에선 한 줄 + "자세히"로 접어 스크롤을 줄이고, 넓은 화면에선 다 보여준다. */
export default function CollapsibleHint({ summary, children, className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`text-xs text-gray-500 dark:text-gray-400 ${className ?? ""}`}>
      <p>
        {summary}{" "}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="sm:hidden font-semibold underline underline-offset-2 min-h-[44px] -my-3 px-1"
        >
          {open ? "접기" : "자세히"}
        </button>
      </p>
      <div className={`mt-1 ${open ? "" : "hidden sm:block"}`}>{children}</div>
    </div>
  );
}

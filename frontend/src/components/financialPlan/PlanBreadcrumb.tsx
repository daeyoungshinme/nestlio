import { ChevronRight } from "lucide-react";

/** 목표 페이지는 페이지 탭(현금흐름 계획/목표) → 뷰(이번 달 계획/연간계획) → 섹션 탭(수입/고정/
 * 변동/비정기/저축투자)까지 3단계로 중첩돼 있어 지금 어디를 보고 있는지 잃기 쉽다. 각 단계
 * 이름을 한 줄로 보여주는 용도로만 쓰는 표시용 컴포넌트 — 클릭 이동은 하지 않는다(이동은
 * 이미 위의 실제 탭들이 담당한다). */
export default function PlanBreadcrumb({ segments }: { segments: string[] }) {
  return (
    <div className="flex items-center flex-wrap gap-1 text-xs text-gray-400 dark:text-gray-500">
      {segments.map((segment, i) => (
        <span key={`${segment}-${i}`} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} className="shrink-0" aria-hidden="true" />}
          <span className={i === segments.length - 1 ? "font-medium text-gray-600 dark:text-gray-300" : undefined}>
            {segment}
          </span>
        </span>
      ))}
    </div>
  );
}

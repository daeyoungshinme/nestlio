import type { ReactNode } from "react";
import Button from "@/components/common/Button";

interface Props {
  /** 안내 문구 — "최근 3개월 평균은 N원이에요." 등 */
  children: ReactNode;
  /** 버튼 라벨. onApply가 없으면 버튼을 그리지 않는다. */
  actionLabel: string;
  onApply?: () => void;
  applying?: boolean;
  className?: string;
}

/** 계획 화면의 "최근 3개월 평균 제안값" 박스 — 수입 섹션·카테고리 예산·저축 상품이 같은 모양을 쓴다. */
export default function SuggestionHint({ children, actionLabel, onApply, applying, className = "" }: Props) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg bg-amber-50 dark:bg-amber-950 px-2 py-1.5 ${className}`}
    >
      <p className="text-xs text-amber-700 dark:text-amber-300">{children}</p>
      {onApply && (
        <Button variant="secondary" size="sm" className="shrink-0" loading={applying} onClick={onApply}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

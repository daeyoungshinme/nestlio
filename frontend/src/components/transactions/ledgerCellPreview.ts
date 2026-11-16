import type { EventOut, RecurringOut, TransactionOut } from "@/types";

/** 캘린더 칸 한 줄 미리보기. `muted`는 완료된 일정처럼 흐리게(취소선) 보여줄 항목. */
export interface CellPreviewLine {
  key: string;
  label: string;
  kind: "income" | "expense" | "event" | "recurring";
  muted?: boolean;
}

export interface CellPreview {
  lines: CellPreviewLine[];
  /** 칸에 다 못 넣고 남은 개수(`+N`). */
  more: number;
}

function take(all: CellPreviewLine[], max: number): CellPreview {
  return { lines: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** "내역" 탭 칸 — 그날 거래를 입력 순서(id 오름차순)대로, 메모가 없으면 카테고리 이름으로. */
export function txPreviewLines(transactions: TransactionOut[], max: number): CellPreview {
  const lines = transactions
    .slice()
    .sort((a, b) => a.id - b.id)
    .map<CellPreviewLine>((tx) => ({
      key: `tx-${tx.id}`,
      label: tx.description || tx.category.name,
      kind: tx.type === "income" ? "income" : "expense",
    }));
  return take(lines, max);
}

/** "일정" 탭 칸 — 일정(백엔드 정렬 = 시작 시각 순) 먼저, 그다음 반복 거래 예정. 완료한 일정은 흐리게. */
export function eventPreviewLines(events: EventOut[], recurringDue: RecurringOut[], max: number): CellPreview {
  const lines: CellPreviewLine[] = [
    ...events.map<CellPreviewLine>((e) => ({
      key: `event-${e.id}-${e.occurrence_start}`,
      label: e.title,
      kind: "event",
      muted: e.completed_at != null,
    })),
    ...recurringDue.map<CellPreviewLine>((r) => ({ key: `recurring-${r.id}`, label: r.name, kind: "recurring" })),
  ];
  return take(lines, max);
}

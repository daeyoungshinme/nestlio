import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImportResultCard } from "@/pages/TransactionImportPage";
import type { ImportResultOut } from "@/types";

describe("ImportResultCard", () => {
  // 형식이 틀린 CSV면 건너뛴 행이 수백 줄이라 20줄 + "외 N건"으로 줄인다.
  it("caps the skipped-row list", () => {
    const result = {
      created: 0,
      created_ids: [],
      auto_categorized: [],
      merged: [],
      unmatched_accounts: [],
      unmatched_owners: [],
      unmatched_cards: [],
      updated: 0,
      skipped: Array.from({ length: 25 }, (_, i) => ({ line: i + 2, reason: "날짜 형식 오류" })),
    } as unknown as ImportResultOut;
    render(<ImportResultCard result={result} />);
    expect(screen.getAllByText(/행: 날짜 형식 오류/)).toHaveLength(20);
    expect(screen.getByText("외 5건")).toBeInTheDocument();
  });

  it("lists rows whose category was inferred from the memo", () => {
    const result: ImportResultOut = {
      created: 2,
      created_ids: [1, 2],
      skipped: [],
      auto_categorized: [{ line: 3, description: "스타벅스 강남점", category_name: "식비", source: "keyword" }],
      merged: [],
      unmatched_accounts: [],
      unmatched_owners: [],
      unmatched_cards: [],
      updated: 0,
    };
    render(<ImportResultCard result={result} />);
    expect(screen.getByText("1건은 메모를 보고 카테고리를 자동으로 정했어요")).toBeInTheDocument();
    expect(screen.getByText("3행 스타벅스 강남점 → 식비 (가맹점)")).toBeInTheDocument();
  });

  it("lists rows merged into one transaction", () => {
    const result: ImportResultOut = {
      created: 1,
      created_ids: [1],
      skipped: [],
      auto_categorized: [],
      merged: [{ lines: [1, 2], description: "점심", amount: "12000.00" }],
      unmatched_accounts: ["없는카드"],
      unmatched_owners: ["모르는사람"],
      unmatched_cards: ["없는카드2"],
      updated: 3,
    };
    render(<ImportResultCard result={result} />);
    expect(screen.getByText("같은 날 비슷한 메모 1묶음은 금액을 합쳐 한 건으로 만들었어요")).toBeInTheDocument();
    expect(screen.getByText(/1·2행 점심 →/)).toBeInTheDocument();
    expect(screen.getByText(/계좌 없이 넣었어요: 없는카드/)).toBeInTheDocument();
    expect(screen.getByText(/공통으로 넣었어요: 모르는사람/)).toBeInTheDocument();
    expect(screen.getByText(/카드 없이 넣었어요: 없는카드2/)).toBeInTheDocument();
    expect(screen.getByText(/3건 채움/)).toBeInTheDocument();
  });
});

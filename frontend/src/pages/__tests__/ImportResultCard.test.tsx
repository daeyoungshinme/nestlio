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
      skipped: Array.from({ length: 25 }, (_, i) => ({ line: i + 2, reason: "날짜 형식 오류" })),
    } as unknown as ImportResultOut;
    render(<ImportResultCard result={result} />);
    expect(screen.getAllByText(/행: 날짜 형식 오류/)).toHaveLength(20);
    expect(screen.getByText("외 5건")).toBeInTheDocument();
  });
});

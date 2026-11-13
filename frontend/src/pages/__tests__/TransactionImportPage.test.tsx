import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportResultOut } from "@/types";

const importTransactionsCsv = vi.fn();
const bulkDeleteTransactions = vi.fn();
vi.mock("@/api/transactions", () => ({
  importTransactionsCsv: (...args: unknown[]) => importTransactionsCsv(...args),
  bulkDeleteTransactions: (...args: unknown[]) => bulkDeleteTransactions(...args),
  fetchTransactionsCsv: vi.fn(),
}));
vi.mock("@/hooks/useReferenceData", () => ({
  useCategories: () => ({ data: [{ id: 1, name: "식비", is_active: true }] }),
}));

const { default: TransactionImportPage } = await import("@/pages/TransactionImportPage");

const RESULT: ImportResultOut = {
  created: 2,
  skipped: [],
  created_ids: [11, 12],
  auto_categorized: [],
  merged: [],
  unmatched_accounts: [],
  unmatched_owners: [],
  unmatched_cards: [],
  updated: 0,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TransactionImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return container;
}

function upload(container: HTMLElement, name = "tx.csv") {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["날짜,구분\n"], name, { type: "text/csv" })] } });
  fireEvent.click(screen.getByRole("button", { name: "업로드" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// 분할(PR K·M) 전 안전망 — CSV 업로드·결과·되돌리기 흐름을 고정한다.
describe("TransactionImportPage", () => {
  it("uploads the chosen file with the fallback category and shows the result", async () => {
    importTransactionsCsv.mockResolvedValue(RESULT);
    const container = renderPage();

    fireEvent.change(screen.getByLabelText("메모로도 못 찾은 지출은"), { target: { value: "1" } });
    upload(container);

    expect(await screen.findByText(/2건 생성됨/)).toBeInTheDocument();
    expect(importTransactionsCsv.mock.calls[0][0]).toBeInstanceOf(File);
    expect(importTransactionsCsv.mock.calls[0][1]).toBe(1);
  });

  it("undoes the imported rows after confirmation", async () => {
    importTransactionsCsv.mockResolvedValue(RESULT);
    bulkDeleteTransactions.mockResolvedValue({ deleted: 2, failed: [] });
    const container = renderPage();
    upload(container);

    fireEvent.click(await screen.findByRole("button", { name: "방금 가져온 2건 되돌리기" }));
    fireEvent.click(await screen.findByRole("button", { name: "되돌리기" }));

    await waitFor(() => expect(bulkDeleteTransactions).toHaveBeenCalledWith([11, 12]));
    await waitFor(() => expect(screen.queryByText(/2건 생성됨/)).not.toBeInTheDocument());
  });

  it("clears the previous result when a later upload fails", async () => {
    importTransactionsCsv.mockResolvedValueOnce(RESULT).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 422, data: { detail: "CSV 형식이 올바르지 않습니다." } },
    });
    const container = renderPage();
    upload(container);
    await screen.findByText(/2건 생성됨/);

    upload(container, "broken.csv");

    expect(await screen.findByText("CSV 형식이 올바르지 않습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /되돌리기/ })).not.toBeInTheDocument();
  });
});

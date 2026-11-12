import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { GrowlioPushFailedOut } from "@/types";

const fetchFailedGrowlioPushes = vi.fn();
const retryGrowlioPush = vi.fn();
vi.mock("@/api/netWorth", () => ({
  fetchFailedGrowlioPushes: () => fetchFailedGrowlioPushes(),
  retryGrowlioPush: (id: number) => retryGrowlioPush(id),
}));

const { default: GrowlioPushFailuresBanner } = await import("@/components/accounts/GrowlioPushFailuresBanner");

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GrowlioPushFailuresBanner />
    </QueryClientProvider>,
  );
}

const FAILED: GrowlioPushFailedOut = {
  id: 7,
  product_name: "ETF",
  transaction_type: "DEPOSIT",
  amount: "300000.00",
  transaction_date: "2026-10-08",
  last_error: "growlio API 오류 (status=404)",
};

describe("GrowlioPushFailuresBanner", () => {
  it("포기한 건이 없으면 아무것도 그리지 않는다", async () => {
    fetchFailedGrowlioPushes.mockResolvedValue([]);
    const { container } = renderBanner();
    await waitFor(() => expect(fetchFailedGrowlioPushes).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("포기한 건과 사유를 보여 주고 다시 보내기를 누르면 그 건을 재전송한다", async () => {
    fetchFailedGrowlioPushes.mockResolvedValue([FAILED]);
    retryGrowlioPush.mockResolvedValue({ sent: true });
    renderBanner();

    expect(await screen.findByText("growlio에 반영하지 못한 입출금 1건")).toBeInTheDocument();
    expect(screen.getByText(/ETF · 입금 300,000원/)).toBeInTheDocument();
    expect(screen.getByText(/status=404/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 보내기" }));
    await waitFor(() => expect(retryGrowlioPush).toHaveBeenCalledWith(7));
  });
});

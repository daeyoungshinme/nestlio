import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useCreateTransaction } from "../useInvalidateTransactionRelated";
import type { TransactionCreateIn } from "@/types";

vi.mock("@/api/transactions", () => ({ createTransaction: vi.fn(async () => ({ id: 42 })) }));

describe("useCreateTransaction", () => {
  it("invalidates transaction-derived caches, then hands the created row to the caller", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const onCreated = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateTransaction(onCreated), { wrapper });
    result.current.mutate({} as TransactionCreateIn);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(onCreated).toHaveBeenCalledWith({ id: 42 });
    const invalidated = spy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(invalidated).toContainEqual(QUERY_KEYS.transactionsAll);
    expect(invalidated).toContainEqual(QUERY_KEYS.netWorthAll);
  });
});

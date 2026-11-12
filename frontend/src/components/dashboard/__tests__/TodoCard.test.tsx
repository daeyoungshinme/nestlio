import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const fetchTodos = vi.fn();
vi.mock("@/api/todos", () => ({
  fetchTodos: (...args: unknown[]) => fetchTodos(...args),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
  completeTodo: vi.fn(),
}));
vi.mock("@/hooks/useReferenceData", () => ({ useMe: () => ({ data: undefined }) }));

const { default: TodoCard } = await import("@/components/dashboard/TodoCard");

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TodoCard day="2026-11-12" users={[]} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// 전에는 로딩 중에 "진행 중인 할일이 없어요"가 먼저 떴다.
describe("TodoCard", () => {
  it("shows a skeleton instead of the empty state while loading", () => {
    fetchTodos.mockReturnValue(new Promise(() => {}));
    renderCard();
    expect(screen.getByRole("status", { name: "로딩 중" })).toBeInTheDocument();
    expect(screen.queryByText("진행 중인 할일이 없어요")).not.toBeInTheDocument();
  });

  it("shows an error with retry when loading fails", async () => {
    fetchTodos.mockRejectedValue(new Error("down"));
    renderCard();
    expect(await screen.findByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("진행 중인 할일이 없어요")).not.toBeInTheDocument());
  });
});

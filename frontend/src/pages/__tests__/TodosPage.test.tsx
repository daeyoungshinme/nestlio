import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoOut, UserOut } from "@/types";

const me = { id: "me", display_name: "민수" } as UserOut;
const partner = { id: "partner", display_name: "지영" } as UserOut;

const fetchTodos = vi.fn();
const completeTodo = vi.fn();
vi.mock("@/api/todos", () => ({
  fetchTodos: (...args: unknown[]) => fetchTodos(...args),
  completeTodo: (...args: unknown[]) => completeTodo(...args),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
}));
vi.mock("@/hooks/useScrollFadeMask", () => ({ useScrollFadeMask: () => ({ ref: { current: null }, style: {} }) }));
vi.mock("@/hooks/useReferenceData", () => ({
  useUsers: () => ({ data: [me, partner] }),
  useMe: () => ({ data: me }),
}));

const { default: TodosPage } = await import("@/pages/TodosPage");

function todo(overrides: Partial<TodoOut>): TodoOut {
  return {
    id: 1,
    title: "할일",
    memo: null,
    due_date: null,
    frequency: "once",
    creator: me,
    assignee: null,
    completed_at: null,
    completer: null,
    created_at: "2026-07-01T09:00:00",
    ...overrides,
  };
}

function renderPage(entry = "/todos") {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <TodosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TodosPage", () => {
  beforeEach(() => {
    fetchTodos.mockReset();
    completeTodo.mockReset();
  });

  it("담당 필터는 공동 할일을 양쪽에 보여준다", async () => {
    fetchTodos.mockResolvedValue([
      todo({ id: 1, title: "내 할일", assignee: me }),
      todo({ id: 2, title: "배우자 할일", assignee: partner }),
      todo({ id: 3, title: "공동 할일" }),
    ]);
    renderPage();
    await screen.findByText("내 할일");
    expect(fetchTodos).toHaveBeenCalledWith("open");

    fireEvent.click(screen.getByRole("tab", { name: "나" }));
    expect(screen.getByText("내 할일")).toBeInTheDocument();
    expect(screen.queryByText("배우자 할일")).not.toBeInTheDocument();
    expect(screen.getByText("공동 할일")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "배우자" }));
    expect(screen.queryByText("내 할일")).not.toBeInTheDocument();
    expect(screen.getByText("배우자 할일")).toBeInTheDocument();
    expect(screen.getByText("공동 할일")).toBeInTheDocument();
  });

  it("완료 탭은 완료 목록을 불러오고 완료한 사람을 보여준다", async () => {
    fetchTodos.mockResolvedValue([
      todo({ title: "끝난 일", assignee: me, completed_at: "2026-07-02T09:00:00", completer: partner }),
    ]);
    renderPage("/todos?tab=완료");

    expect(await screen.findByText(/지영 완료 2026\.07\.02/)).toBeInTheDocument();
    expect(fetchTodos).toHaveBeenCalledWith("done");
  });

  it("체크하면 완료 요청을 보낸다", async () => {
    fetchTodos.mockResolvedValue([todo({ id: 7, title: "분리수거" })]);
    completeTodo.mockResolvedValue(todo({ id: 7 }));
    renderPage();

    fireEvent.click(await screen.findByLabelText("분리수거 완료 처리"));

    await waitFor(() => expect(completeTodo).toHaveBeenCalledWith(7, true));
  });
});

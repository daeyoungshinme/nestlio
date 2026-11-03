import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/api/client";
import type { TodoCreateIn, TodoOut, TodoStatus, TodoUpdateIn } from "@/types";

export const fetchTodos = (status: TodoStatus) => apiGet<TodoOut[]>("/todos", { params: { status } });

export const createTodo = (payload: TodoCreateIn) => apiPost<TodoOut>("/todos", payload);

export const updateTodo = (id: number, payload: TodoUpdateIn) => apiPut<TodoOut>(`/todos/${id}`, payload);

export const deleteTodo = (id: number) => apiDelete(`/todos/${id}`);

export const completeTodo = (id: number, completed: boolean) =>
  apiPatch<TodoOut>(`/todos/${id}/complete`, { completed });

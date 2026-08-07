import { apiGet, apiPut } from "@/api/client";
import type { UserOut } from "@/types";

export const fetchMe = () => apiGet<UserOut>("/users/me");

export const updateMe = (display_name: string) => apiPut<UserOut>("/users/me", { display_name });

export const fetchUsers = () => apiGet<UserOut[]>("/users");

export const updateUser = (userId: string, display_name: string) =>
  apiPut<UserOut>(`/users/${userId}`, { display_name });

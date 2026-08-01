import { apiGet } from "@/api/client";
import type { UserOut } from "@/types";

export const fetchMe = () => apiGet<UserOut>("/users/me");

export const fetchUsers = () => apiGet<UserOut[]>("/users");

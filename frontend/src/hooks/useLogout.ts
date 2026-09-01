import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { clearClientCaches } from "@/utils/session";

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  return async () => {
    clearClientCaches(queryClient);
    await logout();
  };
}

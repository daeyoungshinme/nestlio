import { PiggyBank } from "lucide-react";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import { useAuthStore } from "@/stores/authStore";
import { INPUT_SM } from "@/constants/inputStyles";
import { extractErrorMessage } from "@/utils/error";
import { currentYearMonth } from "@/utils/date";
import { fetchDashboard } from "@/api/dashboard";
import { fetchAccounts } from "@/api/accounts";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { errorMessageTextClass } from "@/utils/colors";

export default function LoginPage() {
  const fieldId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      // 로그인 직후 대시보드 데이터를 백그라운드에서 미리 가져온다.
      const yearMonth = currentYearMonth();
      void queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.dashboard(yearMonth),
        queryFn: () => fetchDashboard(yearMonth),
      });
      void queryClient.prefetchQuery({ queryKey: QUERY_KEYS.accounts, queryFn: fetchAccounts });
      navigate("/");
    } catch (err) {
      if (import.meta.env.DEV) console.error("login failed", err);
      setError(extractErrorMessage(err, "로그인에 실패했습니다"));
    } finally {
      setLoading(false);
    }
  };

  return (
    // px-4: 360px에서 카드가 화면 가장자리에 붙지 않게. 모바일은 카드 안쪽 여백도 줄인다.
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <PiggyBank className="text-primary-600 dark:text-primary-400" size={28} />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Nestlio</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={`${fieldId}-email`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              이메일
            </label>
            <input
              id={`${fieldId}-email`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={`w-full ${INPUT_SM}`}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label
              htmlFor={`${fieldId}-password`}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              비밀번호
            </label>
            <input
              id={`${fieldId}-password`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`w-full ${INPUT_SM}`}
              placeholder="••••••••"
            />
          </div>
          {error && <p className={`text-sm ${errorMessageTextClass()}`}>{error}</p>}
          <Button type="submit" loading={loading} className="w-full justify-center">
            로그인
          </Button>
        </form>
      </div>
    </div>
  );
}

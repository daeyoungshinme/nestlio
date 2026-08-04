import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PiggyBank } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { acceptInvite, fetchInviteByToken } from "@/api/invites";
import { INPUT_SM } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { extractErrorMessage, getHttpStatus } from "@/utils/error";

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <PiggyBank className="text-blue-600 dark:text-blue-400" size={28} />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Nestlio</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function InviteMessage({ message }: { message: string }) {
  return (
    <AuthCard>
      <div className="text-center space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        <Link to="/login" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          로그인으로 이동
        </Link>
      </div>
    </AuthCard>
  );
}

export default function InviteAcceptPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const checkAuth = useAuthStore((s) => s.checkAuth);

  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const inviteQuery = useQuery({
    queryKey: QUERY_KEYS.inviteToken(token),
    queryFn: () => fetchInviteByToken(token),
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: (vars: { userId: string; displayName: string }) =>
      acceptInvite(token, { user_id: vars.userId, display_name: vars.displayName }),
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다");
      return;
    }
    if (!inviteQuery.data) return;

    setSubmitting(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: inviteQuery.data.email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (signUpError || !data.user) {
        const msg = (signUpError?.message ?? "").toLowerCase();
        if (msg.includes("already registered") || msg.includes("already been registered")) {
          setError("이미 사용 중인 이메일입니다");
        } else if (msg.includes("should not be too common") || msg.includes("data breach")) {
          setError("유출된 적 있는 비밀번호입니다. 다른 비밀번호를 사용해주세요.");
        } else {
          setError("가입 중 오류가 발생했습니다");
        }
        return;
      }

      await acceptMutation.mutateAsync({ userId: data.user.id, displayName });

      if (data.session) {
        await checkAuth();
        navigate("/");
      } else {
        setAwaitingConfirmation(true);
      }
    } catch (err) {
      setError(extractErrorMessage(err, "가입 처리 중 오류가 발생했습니다"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return <InviteMessage message="유효하지 않은 초대 링크입니다." />;
  }

  if (inviteQuery.isLoading) {
    return <InviteMessage message="초대 정보를 확인하는 중입니다..." />;
  }

  if (inviteQuery.isError) {
    const status = getHttpStatus(inviteQuery.error);
    const message =
      status === 404 ? "존재하지 않는 초대 링크입니다." : "만료되었거나 이미 사용된 초대 링크입니다.";
    return <InviteMessage message={message} />;
  }

  if (awaitingConfirmation) {
    return (
      <InviteMessage message="가입 확인 이메일을 발송했습니다. 이메일의 인증 링크를 클릭한 후 로그인해주세요. (메일함에 안 보이면 스팸함도 확인해주세요)" />
    );
  }

  return (
    <AuthCard>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
        배우자로부터 초대받았어요. 계정을 만들어주세요.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">이메일</label>
          <input
            type="email"
            value={inviteQuery.data?.email ?? ""}
            disabled
            className={`w-full ${INPUT_SM} opacity-70`}
          />
        </div>
        <div>
          <label
            htmlFor="invite-display-name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            표시 이름
          </label>
          <input
            id="invite-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className={`w-full ${INPUT_SM}`}
            placeholder="홍길동"
          />
        </div>
        <div>
          <label
            htmlFor="invite-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            비밀번호
          </label>
          <input
            id="invite-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={`w-full ${INPUT_SM}`}
            placeholder="8자 이상"
          />
        </div>
        <div>
          <label
            htmlFor="invite-password-confirm"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            비밀번호 확인
          </label>
          <input
            id="invite-password-confirm"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
            className={`w-full ${INPUT_SM}`}
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? "가입 중..." : "가입하기"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
        이미 계정이 있으신가요?{" "}
        <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
          로그인
        </Link>
      </p>
    </AuthCard>
  );
}

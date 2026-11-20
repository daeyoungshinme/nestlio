import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { acceptInvite, fetchInviteByToken } from "@/api/invites";
import { INPUT_SM } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { extractErrorMessage, getHttpStatus } from "@/utils/error";
import AuthCard from "@/components/common/AuthCard";
import Button from "@/components/common/Button";
import { ROUTES } from "@/constants/routes";
import { errorMessageTextClass } from "@/utils/colors";

function InviteMessage({ message }: { message: string }) {
  return (
    <AuthCard>
      <div className="text-center space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        <Link to={ROUTES.login} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
          로그인으로 이동
        </Link>
      </div>
    </AuthCard>
  );
}

export default function InviteAcceptPage() {
  const fieldId = useId();
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
  // 초대 이메일이 growlio 등 같은 Supabase 프로젝트에 이미 가입돼 있는 경우 -
  // signUp이 아니라 기존 비밀번호로 로그인해서 초대를 수락하는 폼으로 전환한다.
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const inviteQuery = useQuery({
    queryKey: QUERY_KEYS.inviteToken(token),
    queryFn: () => fetchInviteByToken(token),
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: (vars: { displayName: string }) => acceptInvite(token, { display_name: vars.displayName }),
    // 실패는 폼 아래에 인라인으로 보여준다 — 비워 두면 전역 MutationCache가 같은 문구를 토스트로 한 번 더 띄운다.
    onError: () => {},
  });

  /** 막 받은 세션으로 초대를 수락한다. 실패하면 세션을 지운다 — 남겨 두면 다음 방문 때 `/users/me`가 이 계정을
   * 초대 없이 가구에 자동 등록해(정원이 남았을 때) 입력한 표시 이름 대신 이메일 앞부분으로 들어간다. */
  const acceptWithNewSession = async () => {
    try {
      await acceptMutation.mutateAsync({ displayName });
    } catch (err) {
      await supabase.auth.signOut();
      throw err;
    }
    await checkAuth();
    navigate(ROUTES.dashboard);
  };

  const switchToExistingAccount = () => {
    setAlreadyRegistered(true);
    setPassword("");
    setPasswordConfirm("");
    setError("이미 가입된 계정이에요. 기존 비밀번호를 입력해서 초대를 수락해주세요.");
  };

  const handleSignInAndAccept = async () => {
    if (!inviteQuery.data) return;
    setSubmitting(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: inviteQuery.data.email,
        password,
      });
      if (signInError || !data.user) {
        setError("비밀번호가 일치하지 않습니다");
        return;
      }
      await acceptWithNewSession();
    } catch (err) {
      setError(extractErrorMessage(err, "초대 수락 중 오류가 발생했습니다"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (alreadyRegistered) {
      await handleSignInAndAccept();
      return;
    }

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
      const redirectParams = new URLSearchParams({
        invite_token: token,
        display_name: displayName,
      });
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: inviteQuery.data.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${ROUTES.authCallback}?${redirectParams.toString()}`,
        },
      });
      if (signUpError || !data.user) {
        const msg = (signUpError?.message ?? "").toLowerCase();
        if (msg.includes("already registered") || msg.includes("already been registered")) {
          switchToExistingAccount();
        } else if (msg.includes("should not be too common") || msg.includes("data breach")) {
          setError("유출된 적 있는 비밀번호입니다. 다른 비밀번호를 사용해주세요.");
        } else {
          setError("가입 중 오류가 발생했습니다");
        }
        return;
      }
      // 이메일 확인이 켜져 있으면 Supabase는 이미 가입된 이메일에도 오류 없이 빈 identities를 돌려준다(가입 여부를
      // 숨기려는 동작) — 확인 메일은 가지 않으므로 "메일을 확인하세요"로 두면 그대로 막힌다. growlio 사용자가 이 경우다.
      if (data.user.identities?.length === 0) {
        switchToExistingAccount();
        return;
      }

      if (data.session) {
        // 이메일 확인 없이 즉시 세션이 발급된 경우 - 방금 생긴 세션의 JWT로 바로 수락한다.
        // 확인이 필요한 경우엔 세션이 아직 없으므로, 수락은 AuthCallbackPage에서 처리한다.
        await acceptWithNewSession();
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
        {alreadyRegistered
          ? "이미 가입된 계정이에요. 기존 비밀번호로 로그인해서 초대를 수락해주세요."
          : "배우자로부터 초대받았어요. 계정을 만들어주세요."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor={`${fieldId}-0`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">이메일</label>
          <input
            id={`${fieldId}-0`}
            type="email"
            value={inviteQuery.data?.email ?? ""}
            disabled
            className={`w-full ${INPUT_SM} opacity-70`}
          />
        </div>
        <div>
          <label
            htmlFor={`${fieldId}-display-name`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            표시 이름
          </label>
          <input
            id={`${fieldId}-display-name`}
            type="text"
            autoComplete="nickname"
            value={displayName}
            maxLength={100}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className={`w-full ${INPUT_SM}`}
            placeholder="홍길동"
          />
        </div>
        <div>
          <label
            htmlFor={`${fieldId}-password`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {alreadyRegistered ? "기존 비밀번호" : "비밀번호"}
          </label>
          <input
            id={`${fieldId}-password`}
            type="password"
            autoComplete={alreadyRegistered ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={`w-full ${INPUT_SM}`}
            placeholder={alreadyRegistered ? "기존 비밀번호" : "8자 이상"}
          />
        </div>
        {!alreadyRegistered && (
          <div>
            <label
              htmlFor={`${fieldId}-password-confirm`}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              비밀번호 확인
            </label>
            <input
              id={`${fieldId}-password-confirm`}
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              className={`w-full ${INPUT_SM}`}
              placeholder="••••••••"
            />
          </div>
        )}
        {error && <p className={`text-sm ${errorMessageTextClass()}`}>{error}</p>}
        <Button type="submit" loading={submitting} className="w-full justify-center">
          {alreadyRegistered ? "로그인하고 초대 수락" : "가입하기"}
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
        이미 계정이 있으신가요?{" "}
        <Link to={ROUTES.login} className="text-primary-600 dark:text-primary-400 hover:underline">
          로그인
        </Link>
      </p>
    </AuthCard>
  );
}

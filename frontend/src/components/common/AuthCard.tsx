import type { ReactNode } from "react";
import { PiggyBank } from "lucide-react";

/** 로그인·초대 수락·이메일 인증 콜백 같은 공개 인증 화면의 가운데 카드(로고 포함). `AppLayout` 밖이라
 * `Header`가 없으므로 여기서 앱 이름을 `h1`로 보여준다. px-4: 360px에서 카드가 화면 가장자리에 붙지 않게. */
export default function AuthCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div
        className={`w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-700 p-6 sm:p-8 ${className}`}
      >
        <div className="flex items-center gap-2 mb-6 justify-center">
          <PiggyBank className="text-primary-600 dark:text-primary-400" size={28} />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Nestlio</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

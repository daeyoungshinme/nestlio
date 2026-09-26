import { PiggyBank } from "lucide-react";
import { NavLink } from "react-router-dom";
import { PRIMARY_NAV_ITEMS } from "@/constants/nav";

export default function Sidebar() {
  // 다크 모드·로그아웃은 설정 화면(헤더 아이콘) 한 곳에만 둔다 — 사이드바/설정 중복 제거.
  // 일정은 가계부의 "일정" 보기로, 연간리포트는 계획 › 연간 › 실적 분석으로 흡수돼 보조 메뉴는 없다 —
  // 사이드바도 하단탭과 같은 5개만 보여준다.
  return (
    <aside
      aria-label="사이드바 내비게이션"
      className="hidden lg:flex w-56 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex-col py-6 px-3"
    >
      <div className="px-3 mb-8">
        <div className="flex items-center gap-2">
          <PiggyBank className="text-primary-600 dark:text-primary-400" size={22} aria-hidden="true" />
          <span className="font-bold text-lg text-gray-900 dark:text-gray-50">Nestlio</span>
        </div>
      </div>

      <nav aria-label="메인 메뉴" className="flex-1 space-y-1">
        {PRIMARY_NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-50"
              }`
            }
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

    </aside>
  );
}

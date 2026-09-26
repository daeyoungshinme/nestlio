import { NavLink } from "react-router-dom";
import { PRIMARY_NAV_ITEMS } from "@/constants/nav";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { Z_BOTTOM_NAV } from "@/constants/zIndex";

export default function BottomNav() {
  return (
    <nav
      aria-label="하단 내비게이션"
      className={`lg:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-stretch justify-around ${Z_BOTTOM_NAV} pb-[env(safe-area-inset-bottom)]`}
    >
      {PRIMARY_NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 px-2 py-3 min-w-0 flex-1 ${TOUCH_TARGET_MIN_HEIGHT} text-xs font-medium transition-colors ${
              isActive
                ? "text-primary-600 dark:text-primary-400 border-t-2 border-primary-600 dark:border-primary-400 -mt-px"
                : "text-gray-500 dark:text-gray-400 border-t-2 border-transparent -mt-px"
            }`
          }
        >
          <Icon size={22} aria-hidden="true" />
          <span className="truncate max-w-full">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

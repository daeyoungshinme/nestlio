import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BOTTOM_NAV_MORE_ITEMS, BOTTOM_NAV_PRIMARY_ITEMS } from "@/constants/nav";
import Modal from "@/components/common/Modal";

export default function BottomNav() {
  const [showMore, setShowMore] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isMoreActive = BOTTOM_NAV_MORE_ITEMS.some((item) => location.pathname.startsWith(item.to));

  return (
    <>
      <nav
        aria-label="하단 내비게이션"
        className="lg:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-stretch justify-around z-50 pb-[env(safe-area-inset-bottom)]"
      >
        {BOTTOM_NAV_PRIMARY_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-2 py-3 min-w-0 flex-1 text-xs font-medium transition-colors ${
                isActive
                  ? "text-blue-600 dark:text-blue-400 border-t-2 border-blue-600 dark:border-blue-400 -mt-px"
                  : "text-gray-500 dark:text-gray-400 border-t-2 border-transparent -mt-px"
              }`
            }
          >
            <Icon size={22} aria-hidden="true" />
            <span className="truncate max-w-full">{label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setShowMore(true)}
          className={`flex flex-col items-center justify-center gap-0.5 px-2 py-3 min-w-0 flex-1 text-xs font-medium transition-colors border-t-2 -mt-px ${
            isMoreActive
              ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400"
              : "text-gray-500 dark:text-gray-400 border-transparent"
          }`}
        >
          <MoreHorizontal size={22} aria-hidden="true" />
          <span className="truncate max-w-full">더보기</span>
        </button>
      </nav>

      {showMore && (
        <Modal onClose={() => setShowMore(false)} title="더보기" size="sm" closeOnBackdrop>
          <div className="p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            {BOTTOM_NAV_MORE_ITEMS.map(({ to, icon: Icon, label }) => (
              <button
                key={to}
                onClick={() => {
                  setShowMore(false);
                  navigate(to);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

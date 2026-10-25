import Button from "@/components/common/Button";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import AccountSection from "@/components/settings/AccountSection";
import CoachingThresholdsSection from "@/components/settings/CoachingThresholdsSection";
import CouplePhotoSection from "@/components/settings/CouplePhotoSection";
import HouseholdSection from "@/components/settings/HouseholdSection";
import NotificationSettingsSection from "@/components/settings/NotificationSettingsSection";
import { useLogout } from "@/hooks/useLogout";
import { useSettings } from "@/hooks/useReferenceData";
import { dangerActionClass } from "@/utils/colors";

export default function SettingsPage() {
  const settingsQuery = useSettings();
  const logout = useLogout();

  return (
    <div className="max-w-lg space-y-4">
      <QueryBoundary
        query={settingsQuery}
        errorMessage="설정 정보를 불러오지 못했습니다."
        loadingFallback={
          <div className="space-y-4">
            <SkeletonCard rows={3} />
            <SkeletonCard rows={4} />
            <SkeletonCard rows={2} />
            <SkeletonCard rows={3} />
            <SkeletonCard rows={3} />
          </div>
        }
      >
        {(settings) => (
          <>
            {/* 자주 쓰는 순서: 계정(+화면) → 가구·초대 → 알림(메일 연결 상태 포함) → 부부 사진 → 고급 */}
            <AccountSection />
            <HouseholdSection />
            <NotificationSettingsSection
              prefs={settings.notification_prefs}
              notifyEmails={settings.notify_emails}
              gmailConnected={settings.google_connected}
            />
            <CouplePhotoSection photoUrl={settings.couple_photo_url} />
            <CoachingThresholdsSection thresholds={settings.coaching_thresholds} />
          </>
        )}
      </QueryBoundary>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <Button
          variant="secondary"
          className={`w-full sm:w-auto text-gray-500 hover:border-red-300 dark:hover:border-red-700 ${dangerActionClass("hover")}`}
          onClick={() => void logout()}
        >
          로그아웃
        </Button>
      </div>
    </div>
  );
}

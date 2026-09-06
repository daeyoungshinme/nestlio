import Button from "@/components/common/Button";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import AccountSection from "@/components/settings/AccountSection";
import CoachingThresholdsSection from "@/components/settings/CoachingThresholdsSection";
import CouplePhotoSection from "@/components/settings/CouplePhotoSection";
import GoogleConnectionSection from "@/components/settings/GoogleConnectionSection";
import HouseholdSection from "@/components/settings/HouseholdSection";
import NotificationSettingsSection from "@/components/settings/NotificationSettingsSection";
import ShortcutsSection from "@/components/settings/ShortcutsSection";
import { useLogout } from "@/hooks/useLogout";
import { useSettings } from "@/hooks/useReferenceData";

export default function SettingsPage() {
  const settingsQuery = useSettings();
  const logout = useLogout();

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">설정</h1>

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
            <AccountSection />
            <CouplePhotoSection photoUrl={settings.couple_photo_url} />
            <HouseholdSection />
            <ShortcutsSection />
            <GoogleConnectionSection connected={settings.google_connected} />
            <NotificationSettingsSection prefs={settings.notification_prefs} notifyEmails={settings.notify_emails} />
            <CoachingThresholdsSection thresholds={settings.coaching_thresholds} />
          </>
        )}
      </QueryBoundary>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <Button
          variant="secondary"
          className="w-full sm:w-auto text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
          onClick={() => void logout()}
        >
          로그아웃
        </Button>
      </div>
    </div>
  );
}

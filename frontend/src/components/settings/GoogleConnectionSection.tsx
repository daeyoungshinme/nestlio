import { CheckCircle2, XCircle } from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import { SettingsSectionCard } from "@/components/settings/shared";
import { connectionStatusBadgeClass, connectionStatusLabel } from "@/utils/colors";

export default function GoogleConnectionSection({ connected }: { connected: boolean }) {
  const status = connected ? "connected" : "disconnected";

  return (
    <SettingsSectionCard
      title="Google 계정 연동"
      badge={
        <StatusBadge
          label={connectionStatusLabel(status)}
          toneClassName={connectionStatusBadgeClass(status)}
          icon={
            connected ? (
              <CheckCircle2 size={12} aria-hidden="true" />
            ) : (
              <XCircle size={12} aria-hidden="true" />
            )
          }
        />
      }
    >
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {connected
          ? "이메일 발송·일정 가져오기에 사용되는 Google 계정이 연결되어 있어요."
          : "이메일 발송·일정 가져오기에 사용할 Google 계정이 아직 연결되지 않았어요. 웹에서 직접 연결하는 기능은 없고, 관리자가 로컬에서 scripts/google_auth_setup.py를 한 번 실행해 연결해요."}
      </p>
    </SettingsSectionCard>
  );
}

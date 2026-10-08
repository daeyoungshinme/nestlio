import { CheckCircle2, XCircle } from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import { SettingsSectionCard } from "@/components/settings/shared";
import { connectionStatusBadgeClass, connectionStatusLabel } from "@/utils/colors";

export default function GoogleConnectionSection({ connected }: { connected: boolean }) {
  const status = connected ? "connected" : "disconnected";

  return (
    <SettingsSectionCard
      title="Gmail 알림 메일"
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
          ? "요약·알림 메일을 보내는 Gmail 계정이 연결되어 있어요."
          : "메일을 보낼 Gmail 계정이 아직 연결되지 않았어요. 알림은 앱 알림함에서 계속 볼 수 있어요. 메일까지 받으려면 관리자가 로컬에서 scripts/google_auth_setup.py를 한 번 실행해 연결해요."}
      </p>
    </SettingsSectionCard>
  );
}

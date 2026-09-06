import { SettingsLinkRow, SettingsSectionCard } from "@/components/settings/shared";
import { ROUTES, accountsSectionLink } from "@/constants/routes";

export default function ShortcutsSection() {
  return (
    <SettingsSectionCard title="바로가기">
      <div className="space-y-1">
        <SettingsLinkRow
          to={accountsSectionLink("저축·투자")}
          label="비상금 관리"
          hint="저축·투자 탭에서 비상금 항목으로 기록해요"
        />
        <SettingsLinkRow to={ROUTES.categories} label="카테고리 관리" hint="고정·변동·비정기지출 카테고리 추가/수정" />
        <SettingsLinkRow
          to={ROUTES.transactionImport}
          label="거래 데이터"
          hint="CSV·구글 시트 가져오기 / CSV 내보내기"
        />
      </div>
    </SettingsSectionCard>
  );
}

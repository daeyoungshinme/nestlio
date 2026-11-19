import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NotificationPrefsOut, SettingsOut } from "@/types";

const allOff: NotificationPrefsOut = {
  email_weekly: false,
  email_monthly: false,
  threshold_alert: false,
  goal_milestone: false,
  challenge_success: false,
  event_reminder: false,
  savings_pace_reminder: false,
  partner_saving: false,
  todo: false,
};
const settingsWith = (prefs: NotificationPrefsOut) =>
  ({ notification_prefs: prefs, notify_emails: ["a@example.com"], google_connected: true }) as SettingsOut;

const fetchSettings = vi.fn();
const setNotificationPrefs = vi.fn();
vi.mock("@/api/settings", () => ({
  fetchSettings: () => fetchSettings(),
  setNotificationPrefs: (p: NotificationPrefsOut) => setNotificationPrefs(p),
  setNotifyEmails: vi.fn(),
  testWeeklyEmail: vi.fn(),
  testMonthlyEmail: vi.fn(),
}));

const { default: NotificationSettingsSection } = await import("@/components/settings/NotificationSettingsSection");
const { QUERY_KEYS } = await import("@/constants/queryKeys");

function Harness() {
  const { data } = useQuery({ queryKey: QUERY_KEYS.settings, queryFn: fetchSettings });
  if (!data) return null;
  return <NotificationSettingsSection prefs={data.notification_prefs} notifyEmails={data.notify_emails} gmailConnected />;
}

// 첫 토글 저장 뒤 설정 재조회가 끝나기 전에 다른 토글을 바꾸면, 옛 값에 덮어써 첫 변경이 되돌아가면 안 된다.
describe("NotificationSettingsSection", () => {
  it("keeps the earlier toggle when a second one is changed before the refetch lands", async () => {
    // 첫 조회만 응답하고 이후 재조회는 끝나지 않는다(느린 네트워크)
    fetchSettings.mockResolvedValueOnce(settingsWith(allOff)).mockReturnValue(new Promise(() => {}));
    // 첫 저장은 테스트가 직접 끝낸다(저장 중 상태를 확인하려고), 이후 저장은 바로 응답
    let finishFirstSave: () => void = () => {};
    setNotificationPrefs
      .mockImplementationOnce(
        (p: NotificationPrefsOut) =>
          new Promise((resolve) => {
            finishFirstSave = () => resolve(settingsWith(p));
          }),
      )
      .mockImplementation((p: NotificationPrefsOut) => Promise.resolve(settingsWith(p)));

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Harness />
      </QueryClientProvider>,
    );
    const weekly = await screen.findByRole("switch", { name: /주간 요약/ });
    fireEvent.click(weekly);
    // 저장 중엔 보낸 값을 바로 보여 주고, 다른 토글은 잠근다
    await waitFor(() => expect(screen.getByRole("switch", { name: /월간 요약/ })).toBeDisabled());
    expect(weekly).toHaveAttribute("aria-checked", "true");

    await act(async () => finishFirstSave());
    await waitFor(() => expect(screen.getByRole("switch", { name: /월간 요약/ })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: /월간 요약/ }));
    });

    expect(setNotificationPrefs).toHaveBeenLastCalledWith({ ...allOff, email_weekly: true, email_monthly: true });
  });
});

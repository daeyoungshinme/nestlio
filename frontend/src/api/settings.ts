import { apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import type { SettingsOut, TestEmailResultOut } from "@/types";

export const fetchSettings = () => apiGet<SettingsOut>("/settings");

export const setEmergencyFund = (balance: string) =>
  apiPut<SettingsOut>("/settings/emergency-fund", { balance });

export const uploadCouplePhoto = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return apiPost<SettingsOut>("/settings/couple-photo", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const deleteCouplePhoto = () => apiDelete<SettingsOut>("/settings/couple-photo");

export const testWeeklyEmail = () => apiPost<TestEmailResultOut>("/settings/test-weekly-email");

export const testMonthlyEmail = () => apiPost<TestEmailResultOut>("/settings/test-monthly-email");

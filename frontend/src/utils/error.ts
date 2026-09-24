type FastApiDetail = string | { msg: string; loc?: unknown[]; type?: string }[];

export interface AxiosLikeError {
  response?: {
    status?: number;
    data?: { detail?: FastApiDetail };
  };
}

export function getHttpStatus(error: unknown): number | undefined {
  return (error as AxiosLikeError)?.response?.status;
}

function parseDetail(detail: FastApiDetail): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => (typeof e === "string" ? e : e.msg)).join(", ");
  }
  return "오류가 발생했습니다";
}

export const SERVER_ERROR_MESSAGE = "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
const TIMEOUT_MESSAGE = "서버 응답이 늦어요. 잠시 후 다시 시도해 주세요.";
const NETWORK_MESSAGE = "네트워크에 연결할 수 없어요. 연결 상태를 확인해 주세요.";
const DEFAULT_MESSAGE = "오류가 발생했습니다";

interface AxiosErrorShape extends AxiosLikeError {
  isAxiosError: true;
  code?: string;
}

function isAxiosError(error: unknown): error is AxiosErrorShape {
  return (error as { isAxiosError?: unknown })?.isAxiosError === true;
}

/** API 에러를 사용자에게 보여줄 한국어 문구로 바꾼다. 백엔드 `detail`이 있으면 그대로 쓰고,
 * axios 에러인데 detail이 없으면(타임아웃·네트워크 끊김·HTML 500 등) axios의 영문 메시지
 * ("timeout of 15000ms exceeded", "Network Error")를 노출하지 않고 상황별 한국어 문구로 대체한다. */
export function extractErrorMessage(error: unknown, fallback?: string): string {
  if (typeof error === "string") return error;
  const data = (error as { response?: { data?: { detail?: FastApiDetail } } })?.response?.data;
  if (data?.detail !== undefined) return parseDetail(data.detail);
  if (isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return TIMEOUT_MESSAGE;
    if (!error.response) return NETWORK_MESSAGE;
    if ((error.response.status ?? 0) >= 500) return fallback ?? SERVER_ERROR_MESSAGE;
    return fallback ?? DEFAULT_MESSAGE;
  }
  if (error instanceof Error) return error.message || (fallback ?? DEFAULT_MESSAGE);
  return fallback ?? DEFAULT_MESSAGE;
}

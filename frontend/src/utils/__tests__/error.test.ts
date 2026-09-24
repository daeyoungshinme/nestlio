import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { SERVER_ERROR_MESSAGE, extractErrorMessage } from "@/utils/error";

function axiosError(opts: { status?: number; detail?: unknown; code?: string }): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response =
    opts.status === undefined
      ? undefined
      : {
          status: opts.status,
          statusText: "",
          headers: {},
          config,
          data: opts.detail === undefined ? "<html>Internal Server Error</html>" : { detail: opts.detail },
        };
  return new AxiosError("Request failed", opts.code, config, undefined, response);
}

describe("extractErrorMessage", () => {
  it("prefers the backend detail, joining validation errors", () => {
    expect(extractErrorMessage(axiosError({ status: 409, detail: "이미 연결된 상품입니다" }))).toBe("이미 연결된 상품입니다");
    expect(
      extractErrorMessage(axiosError({ status: 422, detail: [{ msg: "금액 오류" }, { msg: "날짜 오류" }] })),
    ).toBe("금액 오류, 날짜 오류");
  });

  it("never leaks axios's English messages for timeouts, network errors or detail-less 5xx", () => {
    expect(extractErrorMessage(axiosError({ code: "ECONNABORTED" }))).toContain("응답이 늦어요");
    expect(extractErrorMessage(axiosError({}))).toContain("네트워크");
    expect(extractErrorMessage(axiosError({ status: 500 }))).toBe(SERVER_ERROR_MESSAGE);
  });

  it("uses the caller's fallback for detail-less HTTP errors", () => {
    expect(extractErrorMessage(axiosError({ status: 500 }), "계좌를 불러오지 못했어요")).toBe("계좌를 불러오지 못했어요");
    expect(extractErrorMessage(axiosError({ status: 404 }))).toBe("오류가 발생했습니다");
  });

  it("keeps plain Error messages (e.g. thrown by the auth store)", () => {
    expect(extractErrorMessage(new Error("로그인에 실패했습니다."))).toBe("로그인에 실패했습니다.");
    expect(extractErrorMessage("직접 넘긴 문구")).toBe("직접 넘긴 문구");
  });
});

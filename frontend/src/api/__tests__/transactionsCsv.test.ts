import { describe, expect, it } from "vitest";
import { withJsonErrorBody } from "@/api/transactions";
import { extractErrorMessage } from "@/utils/error";

// CSV 내보내기는 responseType "blob"이라 에러 본문도 Blob으로 와서 백엔드 detail이 화면에 안 보였다.
describe("withJsonErrorBody", () => {
  it("unwraps a JSON blob so the backend detail reaches the user", async () => {
    const err = {
      isAxiosError: true,
      response: { status: 400, data: new Blob([JSON.stringify({ detail: "기간이 너무 깁니다." })]) },
    };
    expect(extractErrorMessage(await withJsonErrorBody(err))).toBe("기간이 너무 깁니다.");
  });

  it("leaves non-JSON bodies alone", async () => {
    const err = { isAxiosError: true, response: { status: 502, data: new Blob(["<html>bad gateway</html>"]) } };
    expect(extractErrorMessage(await withJsonErrorBody(err))).toBe("서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerBlobDownload } from "@/utils/download";

afterEach(() => vi.restoreAllMocks());

describe("triggerBlobDownload", () => {
  it("blob URL로 파일명을 지정해 클릭하고, 링크와 URL을 정리한다", () => {
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toBe("transactions_2026-08-01_2026-08-31.csv");
      expect(this.href).toBe("blob:fake");
    });
    const blob = new Blob(["a,b"], { type: "text/csv" });

    triggerBlobDownload(blob, "transactions_2026-08-01_2026-08-31.csv");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});

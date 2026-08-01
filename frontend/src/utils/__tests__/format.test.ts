import { describe, expect, it } from "vitest";
import {
  formatKrw,
  formatKrwCompact,
  formatKrwPreview,
  formatNumber,
  formatPercent,
  formatYearMonth,
  toAmountInputValue,
} from "@/utils/format";

describe("formatKrw", () => {
  it("formats a decimal string with thousands separators and 원 suffix", () => {
    expect(formatKrw("12345")).toBe("12,345원");
  });

  it("treats null/undefined as 0원", () => {
    expect(formatKrw(null)).toBe("0원");
    expect(formatKrw(undefined)).toBe("0원");
  });

  it("accepts a plain number", () => {
    expect(formatKrw(500000)).toBe("500,000원");
  });
});

describe("formatKrwCompact", () => {
  it("shows exact comma amount below 1만", () => {
    expect(formatKrwCompact(3000)).toBe("3,000원");
  });

  it("abbreviates to 만원 between 1만 and 1억", () => {
    expect(formatKrwCompact(5000000)).toBe("500만원");
  });

  it("abbreviates to 억원 at 1억 and above", () => {
    expect(formatKrwCompact(150000000)).toBe("1.50억원");
  });
});

describe("formatKrwPreview", () => {
  it("shows only the exact amount below 1만", () => {
    expect(formatKrwPreview(3000)).toBe("3,000원");
  });

  it("appends the 만원 abbreviation for amounts at or above 1만", () => {
    expect(formatKrwPreview(5000000)).toBe("5,000,000원 (500만원)");
  });

  it("appends the 억원 abbreviation for amounts at or above 1억", () => {
    expect(formatKrwPreview(150000000)).toBe("150,000,000원 (1.50억원)");
  });
});

describe("formatNumber", () => {
  it("formats without the currency suffix", () => {
    expect(formatNumber("1234567")).toBe("1,234,567");
  });
});

describe("formatPercent", () => {
  it("rounds to 0 decimal digits by default", () => {
    expect(formatPercent(42.6)).toBe("43%");
  });
});

describe("formatYearMonth", () => {
  it("converts YYYY-MM into Korean year/month text", () => {
    expect(formatYearMonth("2026-07")).toBe("2026년 7월");
  });
});

describe("toAmountInputValue", () => {
  it("strips trailing decimal zeros from a Decimal string", () => {
    expect(toAmountInputValue("500000.00")).toBe("500000");
  });

  it("treats null/undefined/empty string as 0", () => {
    expect(toAmountInputValue(null)).toBe("0");
    expect(toAmountInputValue(undefined)).toBe("0");
    expect(toAmountInputValue("")).toBe("0");
    expect(toAmountInputValue("0.00")).toBe("0");
  });

  it("accepts a plain number", () => {
    expect(toAmountInputValue(500000)).toBe("500000");
  });
});

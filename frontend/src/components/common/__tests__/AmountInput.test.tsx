import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import AmountInput, { formatAmountInput, sanitizeAmountInput, toggleAmountSign } from "@/components/common/AmountInput";

describe("sanitizeAmountInput", () => {
  it.each([
    ["1,250,000", "1250000"],
    ["1250000원", "1250000"],
    ["", ""],
    ["abc", ""],
    ["007", "7"],
    ["0", "0"],
    ["-500", "500"],
    ["1e5", "15"],
    ["12345.5", "12345.5"],
    ["1.2.3", "1.23"],
    [".5", "0.5"],
  ])("%s → %s", (raw, expected) => {
    expect(sanitizeAmountInput(raw)).toBe(expected);
  });
});

describe("formatAmountInput", () => {
  it.each([
    ["", ""],
    ["0", "0"],
    ["999", "999"],
    ["1000", "1,000"],
    ["1250000", "1,250,000"],
    ["12345678901234", "12,345,678,901,234"],
    ["12345.5", "12,345.5"],
  ])("%s → %s", (value, expected) => {
    expect(formatAmountInput(value)).toBe(expected);
  });
});

function Harness({ initial = "", allowNegative }: { initial?: string; allowNegative?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <AmountInput label="금액" value={value} onChange={setValue} allowNegative={allowNegative} />
      <output data-testid="raw">{value}</output>
    </>
  );
}

describe("AmountInput", () => {
  it("shows commas while keeping the raw value comma-free", () => {
    render(<Harness />);
    const input = screen.getByLabelText("금액");

    fireEvent.change(input, { target: { value: "1250000" } });

    expect(input).toHaveValue("1,250,000");
    expect(screen.getByTestId("raw")).toHaveTextContent(/^1250000$/);
    expect(input).toHaveAttribute("inputmode", "numeric");
  });

  it("clears to an empty string", () => {
    render(<Harness initial="5000" />);
    const input = screen.getByLabelText("금액");

    fireEvent.change(input, { target: { value: "" } });

    expect(input).toHaveValue("");
    expect(screen.getByTestId("raw")).toBeEmptyDOMElement();
  });
});

describe("negative amounts", () => {
  it.each([
    ["-1,250,000", "-1250000"],
    ["- 500", "-500"],
    ["5-00", "500"],
  ])("sanitize(%s, allowNegative) → %s", (raw, expected) => {
    expect(sanitizeAmountInput(raw, true)).toBe(expected);
  });

  it("formats and toggles the sign without touching empty or zero", () => {
    expect(formatAmountInput("-1250000")).toBe("-1,250,000");
    expect(toggleAmountSign("5000")).toBe("-5000");
    expect(toggleAmountSign("-5000")).toBe("5000");
    expect(toggleAmountSign("")).toBe("");
    expect(toggleAmountSign("0")).toBe("0");
  });

  // 숫자 키패드엔 "-" 키가 없어서 마이너스통장 잔액은 버튼으로만 음수가 된다.
  it("flips the sign with the toggle button", () => {
    render(<Harness initial="300000" allowNegative />);
    fireEvent.click(screen.getByRole("button", { name: "마이너스 금액으로 바꾸기" }));
    expect(screen.getByLabelText("금액")).toHaveValue("-300,000");
    expect(screen.getByTestId("raw")).toHaveTextContent(/^-300000$/);
    expect(screen.getByText("마이너스 300,000원 (30만원)")).toBeInTheDocument();
  });
});

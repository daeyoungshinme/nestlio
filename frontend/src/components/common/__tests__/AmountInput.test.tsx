import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import AmountInput, { formatAmountInput, sanitizeAmountInput } from "@/components/common/AmountInput";

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

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <AmountInput label="금액" value={value} onChange={setValue} />
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

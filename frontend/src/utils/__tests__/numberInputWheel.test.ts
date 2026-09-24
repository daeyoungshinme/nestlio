import { afterEach, describe, expect, it } from "vitest";
import { installNumberInputWheelGuard } from "../numberInputWheel";

describe("installNumberInputWheelGuard", () => {
  let uninstall: (() => void) | undefined;

  afterEach(() => {
    uninstall?.();
    document.body.innerHTML = "";
  });

  it("blurs a focused number input when the wheel fires on it", () => {
    uninstall = installNumberInputWheelGuard();
    const input = document.createElement("input");
    input.type = "number";
    document.body.appendChild(input);
    input.focus();

    input.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));

    expect(document.activeElement).not.toBe(input);
  });

  it("leaves a focused text input alone", () => {
    uninstall = installNumberInputWheelGuard();
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);
    input.focus();

    input.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));

    expect(document.activeElement).toBe(input);
  });
});

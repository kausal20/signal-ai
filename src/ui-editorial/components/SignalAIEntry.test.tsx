import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignalAIEntry } from "./SignalAIEntry";

afterEach(cleanup);

describe("Home Signal composer", () => {
  it("blocks empty and whitespace-only submissions", () => {
    const open = vi.fn();
    render(<SignalAIEntry onOpen={open} />);
    const input = screen.getByRole("textbox");
    const button = screen.getByRole("button", { name: "Send question to Signal AI" });
    expect(button).toBeDisabled();
    fireEvent.submit(input.closest("form")!);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);
    expect(button).toBeDisabled();
    expect(open).not.toHaveBeenCalled();
  });

  it("sends the trimmed question instead of just opening the page", () => {
    const open = vi.fn();
    render(<SignalAIEntry onOpen={open} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Explain AI agents  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send question to Signal AI" }));
    expect(open).toHaveBeenCalledExactlyOnceWith("Explain AI agents");
  });
});

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatProvider, useChat } from "./ChatProvider";

const chat = vi.hoisted(() => ({ messages: [], status: "idle", send: vi.fn(), stop: vi.fn(), newChat: vi.fn() }));
vi.mock("@/hooks/useAskSignal", () => ({ useAskSignal: () => chat }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("conversation lifecycle", () => {
  it("clears the previous article when starting a new conversation", () => {
    const { result } = renderHook(() => useChat(), { wrapper: ChatProvider });
    act(() => result.current.startAbout({ headline: "AI agents", summary: "A story" }));
    expect(result.current.context?.headline).toBe("AI agents");
    act(() => result.current.newChat());
    expect(result.current.context).toBeUndefined();
  });

  it("ignores blank opening questions without resetting the conversation", () => {
    const { result } = renderHook(() => useChat(), { wrapper: ChatProvider });
    act(() => result.current.startWith("   "));
    expect(chat.newChat).not.toHaveBeenCalled();
    expect(chat.send).not.toHaveBeenCalled();
  });
});

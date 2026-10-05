import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useAutosave, { drafts } from "../hooks/useAutosave";

describe("useAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces and merges changes into one save", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAutosave(save, { delay: 500 }));

    act(() => {
      result.current.queue({ title: "a" });
      result.current.queue({ content: "b" });
    });
    expect(result.current.status).toBe("pending");
    expect(save).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({ title: "a", content: "b" });
    expect(result.current.status).toBe("saved");
  });

  it("never runs two saves at once and sends edits made mid-save next", async () => {
    let resolveFirst;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValue({});
    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));

    act(() => result.current.queue({ content: "1" }, true));
    await act(() => Promise.resolve());
    expect(result.current.status).toBe("saving");

    act(() => result.current.queue({ content: "2" }, true));
    await act(() => Promise.resolve());
    expect(save).toHaveBeenCalledOnce(); // second waits for the first

    await act(async () => resolveFirst({}));
    await act(() => vi.runAllTimersAsync());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ content: "2" });
    expect(result.current.status).toBe("saved");
  });

  it("keeps failed changes and retries them on flush", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));

    act(() => result.current.queue({ title: "x" }));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current.status).toBe("error");
    expect(result.current.error.message).toBe("offline");

    await act(() => result.current.flush());
    expect(save).toHaveBeenLastCalledWith({ title: "x" });
    expect(result.current.status).toBe("saved");
  });

  it("flushes pending changes on unmount, and discard drops them", async () => {
    const save = vi.fn().mockResolvedValue({});
    const first = renderHook(() => useAutosave(save, { delay: 10_000 }));
    act(() => first.result.current.queue({ content: "unsaved" }));
    first.unmount();
    await act(() => Promise.resolve());
    expect(save).toHaveBeenCalledWith({ content: "unsaved" });

    save.mockClear();
    const second = renderHook(() => useAutosave(save, { delay: 10_000 }));
    act(() => {
      second.result.current.queue({ content: "throwaway" });
      second.result.current.discard();
    });
    second.unmount();
    await act(() => vi.runAllTimersAsync());
    expect(save).not.toHaveBeenCalled();
  });
});

describe("useAutosave drafts and retries", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps unsaved edits in localStorage until the server confirms them", async () => {
    let resolveSave;
    const save = vi.fn(() => new Promise((r) => (resolveSave = r)));
    const { result } = renderHook(() => useAutosave(save, { delay: 100, draftId: "n1" }));

    act(() => result.current.queue({ content: "draft text" }));
    expect(drafts.read("n1").patch).toEqual({ content: "draft text" });

    await act(() => vi.advanceTimersByTimeAsync(100));
    // Still in flight: the draft must survive a crash right now.
    expect(drafts.read("n1").patch).toEqual({ content: "draft text" });

    await act(async () => resolveSave({}));
    expect(drafts.read("n1")).toBeNull();
  });

  it("keeps the draft and retries automatically after a network error", async () => {
    const offline = Object.assign(new Error("offline"), { code: "network_error" });
    const save = vi.fn().mockRejectedValueOnce(offline).mockResolvedValue({});
    const { result } = renderHook(() => useAutosave(save, { delay: 100, draftId: "n2" }));

    act(() => result.current.queue({ title: "x" }));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current.status).toBe("offline");
    expect(drafts.read("n2").patch).toEqual({ title: "x" });

    await act(() => vi.advanceTimersByTimeAsync(3_000)); // first retry delay
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
    expect(drafts.read("n2")).toBeNull();
  });

  it("does not retry errors that retrying can't fix", async () => {
    const invalid = Object.assign(new Error("bad"), { status: 422 });
    const save = vi.fn().mockRejectedValue(invalid);
    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));
    act(() => result.current.queue({ title: "x" }));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("error");
  });
});

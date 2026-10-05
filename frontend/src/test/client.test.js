import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, onSessionEnded, request, tokenStore } from "../api/client";

function jsonResponse(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const expired = () =>
  jsonResponse(401, { error: { code: "token_expired", message: "Your access token has expired." } });

describe("API client", () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    tokenStore.set({ access_token: "old-access", refresh_token: "refresh" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the access token and parses JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await expect(request("/notes")).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/notes$/);
    expect(init.headers.Authorization).toBe("Bearer old-access");
  });

  it("refreshes an expired token once and retries", async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "new-access" }))
      .mockResolvedValueOnce(jsonResponse(200, { notes: [] }));

    await expect(request("/notes")).resolves.toEqual({ notes: [] });
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/refresh$/);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer refresh");
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer new-access");
    expect(tokenStore.get().access_token).toBe("new-access");
  });

  it("shares one refresh between concurrent requests", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith("/auth/refresh")) return jsonResponse(200, { access_token: "new-access" });
      return init.headers.Authorization === "Bearer new-access" ? jsonResponse(200, { ok: 1 }) : expired();
    });
    await Promise.all([request("/a"), request("/b"), request("/c")]);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });

  it("ends the session when the refresh token is rejected", async () => {
    const ended = vi.fn();
    const unsubscribe = onSessionEnded(ended);
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "token_revoked", message: "revoked" } }));

    await expect(request("/notes")).rejects.toMatchObject({ code: "session_expired" });
    expect(ended).toHaveBeenCalledOnce();
    expect(tokenStore.get()).toBeNull();
    unsubscribe();
  });

  it("turns API errors into ApiError with field details", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        error: { code: "validation_error", message: "Some fields are invalid.", details: { name: ["Too long."] } },
      }),
    );
    const err = await request("/folders", { method: "POST", body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.fieldErrors).toEqual({ name: "Too long." });
  });

  it("reports network failures clearly", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(request("/notes")).rejects.toMatchObject({ code: "network_error" });
  });

  it("handles non-JSON server errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(request("/notes")).rejects.toMatchObject({ status: 502, code: "http_502" });
  });

  it("does not send tokens or refresh for auth: false requests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: "invalid_credentials", message: "Invalid email or password." } }),
    );
    await expect(request("/auth/login", { method: "POST", body: {}, auth: false })).rejects.toMatchObject({
      code: "invalid_credentials",
    });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(tokenStore.get()).not.toBeNull();
  });
});

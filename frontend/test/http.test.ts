import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getToken, onUnauthorized, request, setToken } from "../src/api/http";
import { TOKEN_KEY } from "../src/config";

describe("HTTP client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const unauthorized = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    onUnauthorized(unauthorized);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    onUnauthorized(() => {});
  });

  it("adds query values, bearer token, and JSON body headers", async () => {
    setToken("session-token");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ value: 1 }), { status: 200 }));

    await expect(request("/events", {
      method: "POST",
      body: { title: "Outage" },
      query: { group: 7, omitted: undefined },
    })).resolves.toEqual({ value: 1 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(new URL("/api/events?group=7", window.location.origin).toString());
    expect(options).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer session-token", "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Outage" }),
    });
  });

  it("omits auth and body headers when no token or body exists", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await request("/groups");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: {},
      body: undefined,
    });
  });

  it("returns undefined for no-content responses", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(request("/groups/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it.each([
    [{ error: "Bad request" }, "Bad request"],
    [{ message: "Not found" }, "Not found"],
    [{ error: { message: "Invalid token" } }, "Invalid token"],
    [null, "Request failed (422)"],
  ])("converts API errors into ApiError with a useful message", async (payload, message) => {
    fetchMock.mockResolvedValue(new Response(payload === null ? "not-json" : JSON.stringify(payload), { status: 422 }));
    await expect(request("/broken")).rejects.toMatchObject({ name: "Error", message, status: 422 });
  });

  it("signs out on a protected 401 but not on public requests", async () => {
    setToken("expired");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

    await expect(request("/me")).rejects.toBeInstanceOf(ApiError);
    expect(unauthorized).toHaveBeenCalledOnce();
    await expect(request("/login", { public: true })).rejects.toBeInstanceOf(ApiError);
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it("wraps network failures and preserves storage token helpers", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    await expect(request("/events")).rejects.toMatchObject({
      message: "Can't reach the server. Check your connection and try again.",
      status: 0,
    });

    setToken("persisted");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("persisted");
    expect(getToken()).toBe("persisted");
    setToken(null);
    expect(getToken()).toBeNull();
  });
});

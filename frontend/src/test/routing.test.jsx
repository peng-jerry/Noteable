import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../App";
import { tokenStore } from "../api";
import { AuthProvider } from "../auth/AuthContext";
import { ToastProvider } from "../components/Toasts";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const USER = { id: "u1", email: "alice@example.com", display_name: "Alice", created_at: "2026-01-01T00:00:00Z" };

function renderAt(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>,
  );
  return router;
}

describe("public / private routing", () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the landing page to everyone", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { name: /markdown notes/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects anonymous users from private pages to login", async () => {
    const router = renderAt("/notes");
    expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("logs in and returns to the page that was requested", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith("/auth/login")) {
        return jsonResponse(200, { user: USER, access_token: "a", refresh_token: "r" });
      }
      return jsonResponse(200, {});
    });
    const router = renderAt("/settings");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(tokenStore.get()).toEqual({ access_token: "a", refresh_token: "r" });
  });

  it("shows server errors on the login form", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { code: "invalid_credentials", message: "Invalid email or password." } }),
    );
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass1");
    await user.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });

  it("validates the register form before calling the API", async () => {
    renderAt("/register");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText(/at least 8 characters\.$/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends logged-in users from /login to their notes", async () => {
    tokenStore.set({ access_token: "a", refresh_token: "r" });
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith("/auth/me")) return jsonResponse(200, { user: USER });
      if (url.includes("/folders")) return jsonResponse(200, { folders: [], unfiled_note_count: 0 });
      return jsonResponse(200, { notes: [], pagination: { page: 1, per_page: 50, total: 0, pages: 0 } });
    });
    const router = renderAt("/login");
    await waitFor(() => expect(router.state.location.pathname).toBe("/notes"));
    expect(await screen.findByText("No notes here yet.")).toBeInTheDocument();
  });

  it("explains when the server can't be reached on startup", async () => {
    tokenStore.set({ access_token: "a", refresh_token: "r" });
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAt("/notes");
    expect(await screen.findByRole("heading", { name: /can't reach the server/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows a 404 page for unknown routes", async () => {
    renderAt("/nope");
    expect(await screen.findByRole("heading", { name: /page not found/i })).toBeInTheDocument();
  });
});

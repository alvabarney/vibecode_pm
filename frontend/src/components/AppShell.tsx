"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError, getSession, login, logout, type SessionResponse } from "@/lib/api";
import { KanbanBoard } from "@/components/KanbanBoard";

type AuthState = {
  status: "loading" | "ready";
  session: SessionResponse;
  error: string | null;
};

const signedOutSession: SessionResponse = {
  authenticated: false,
  username: null,
};

export const AppShell = () => {
  const [authState, setAuthState] = useState<AuthState>({
    status: "loading",
    session: signedOutSession,
    error: null,
  });
  const [username, setUsername] = useState("user");
  const [password, setPassword] = useState("password");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await getSession();
        setAuthState({ status: "ready", session, error: null });
      } catch {
        setAuthState({
          status: "ready",
          session: signedOutSession,
          error: "Unable to reach the backend.",
        });
      }
    };

    void loadSession();
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthState((prev) => ({ ...prev, error: null }));

    try {
      const session = await login(username, password);
      setAuthState({ status: "ready", session, error: null });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Unable to sign in right now.";
      setAuthState({
        status: "ready",
        session: signedOutSession,
        error: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsSubmitting(true);

    try {
      const session = await logout();
      setAuthState({ status: "ready", session, error: null });
    } catch {
      setAuthState((prev) => ({
        ...prev,
        error: "Unable to sign out right now.",
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authState.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="rounded-3xl border border-[var(--stroke)] bg-white px-6 py-5 shadow-[var(--shadow)]">
          Checking your session...
        </div>
      </main>
    );
  }

  if (authState.session.authenticated) {
    return (
      <KanbanBoard
        userName={authState.session.username ?? "user"}
        onLogout={() => {
          void handleLogout();
        }}
        isLoggingOut={isSubmitting}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Project Management MVP
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
          Sign in
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          Use the MVP credentials to access the single-board Kanban experience.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleLogin}>
          <label className="block text-sm font-semibold text-[var(--navy-dark)]">
            Username
            <input
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--primary-blue)]"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="block text-sm font-semibold text-[var(--navy-dark)]">
            Password
            <input
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--primary-blue)]"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>

          {authState.error ? (
            <p className="text-sm font-semibold text-[var(--secondary-purple)]">
              {authState.error}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
};

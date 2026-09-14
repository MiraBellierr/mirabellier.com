import React, { createContext, useContext, useEffect, useState } from "react";
import { API_BASE } from "@/lib/config";
import { COOKIE_SESSION_TOKEN_MARKER } from "@/lib/auth-session";
import { clearApiCache } from "@/lib/api-cache";
import type { AuthUserPermissions, AuthUserRole } from "@/lib/user-permissions";

type User = {
  id: string;
  username: string;
  avatar?: string | null;
  banner?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  roles?: AuthUserRole[];
  permissions?: AuthUserPermissions;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  logout: () => void;
  updateProfile: (data: FormData) => Promise<User>;
  handleAuthCallback: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

// The `/me` answer is cached for the tab session so a back/forward navigation
// or a repeat visit paints the correct signed-in/out state on the very first
// render — no logged-out flash, and the network call can be deferred past the
// first paint without any page briefly believing nobody is signed in (which
// matters: `BlogEdit` redirects to Discord login when `token` is null).
//
// Session storage only, never local storage: it is cleared when the tab closes
// and on logout, so a shared browser can't leak one visitor's profile to the
// next. The cached value is still revalidated on every load, so a session that
// ended in another tab is corrected as soon as the network answers.
const AUTH_CACHE_KEY = "mirabellier-auth-cache";
const AUTH_CACHE_TTL_MS = 5 * 60_000;

type CachedAuth = { user: User | null; at: number };

function readAuthCache(): CachedAuth | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedAuth | null;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > AUTH_CACHE_TTL_MS) return null;

    return parsed;
  } catch {
    return null;
  }
}

function writeAuthCache(user: User | null): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      AUTH_CACHE_KEY,
      JSON.stringify({ user, at: Date.now() } satisfies CachedAuth),
    );
  } catch {
    // Storage may be unavailable (private mode / quota) — the session still
    // works, it just re-fetches.
  }
}

function clearAuthCache(): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    // ignore
  }
}

// Read once at module scope so the initial `useState` calls are consistent
// with each other (user and token can never disagree).
const initialCache = readAuthCache();

// The `/me` call is cheap but cross-origin; on a slow phone it competes with
// the LCP image and the first route chunk for bandwidth. When the cache
// already answered, push the revalidation past the first paint so it cannot
// delay anything visible. Without a cached answer, fetch immediately — an
// auth-gated route must not render its "not logged in" branch first.
function runAfterFirstPaint(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  // Local alias: the `in` narrowing below otherwise narrows `window` itself
  // (which lib.dom types as always having `requestIdleCallback`) to `never`.
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  let cancelled = false;
  let idleId: number | null = null;
  let timeoutId: number | null = null;

  const run = () => {
    if (!cancelled) callback();
  };

  if (typeof win.requestIdleCallback === "function") {
    idleId = win.requestIdleCallback(run, { timeout: 2000 });
  } else {
    timeoutId = window.setTimeout(run, 200);
  }

  return () => {
    cancelled = true;
    if (idleId !== null && typeof win.cancelIdleCallback === "function") {
      win.cancelIdleCallback(idleId);
    }
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(initialCache?.user ?? null);
  const [token, setToken] = useState<string | null>(
    initialCache?.user ? COOKIE_SESSION_TOKEN_MARKER : null,
  );

  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();

    const load = () => {
      fetch(`${API_BASE}/me`, {
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => {
          if (canceled) return;
          setUser(data);
          setToken(COOKIE_SESSION_TOKEN_MARKER);
          writeAuthCache(data);
        })
        .catch(() => {
          if (canceled) return;
          setUser(null);
          setToken(null);
          // A cached "signed out" is worth keeping; a cached profile is not,
          // because the session behind it is gone.
          writeAuthCache(null);
        });
    };

    // A cached answer already painted the right state, so the revalidation can
    // wait for idle. Without a cache there is nothing to show yet, so fetch now.
    const cancelPending =
      initialCache !== null
        ? runAfterFirstPaint(load)
        : (load(), () => {});

    return () => {
      canceled = true;
      cancelPending();
      controller.abort();
    };
  }, []);

  const handleAuthCallback = async () => {
    try {
      const res = await fetch(`${API_BASE}/me`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to complete auth callback");
      const data = (await res.json()) as User;
      setUser(data);
      setToken(COOKIE_SESSION_TOKEN_MARKER);
      writeAuthCache(data);
    } catch {
      setUser(null);
      setToken(null);
      writeAuthCache(null);
      throw new Error("Failed to complete auth callback");
    }
  };

  const logout = () => {
    fetch(`${API_BASE}/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    setUser(null);
    setToken(null);
    clearAuthCache();
    // Drop the SWR cache so a shared browser starts clean on the next session.
    clearApiCache();
  };

  const updateProfile = async (formData: FormData) => {
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(`${API_BASE}/me`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!res.ok) throw new Error("Update failed");
    const data = (await res.json()) as User;
    setUser(data);
    setToken(COOKIE_SESSION_TOKEN_MARKER);
    writeAuthCache(data);
    return data;
  };

  return (
    <AuthContext.Provider
      value={{ user, token, logout, updateProfile, handleAuthCallback }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

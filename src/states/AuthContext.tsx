import React, { createContext, useContext, useEffect, useState } from "react";
import { API_BASE } from "@/lib/config";
import { COOKIE_SESSION_TOKEN_MARKER } from "@/lib/auth-session";
import type { AuthUserPermissions, AuthUserRole } from "@/lib/user-permissions";

type User = {
  id: string;
  username: string;
  discordId?: string;
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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    fetch(`${API_BASE}/me`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (canceled) return;
        setUser(data);
        setToken(COOKIE_SESSION_TOKEN_MARKER);
      })
      .catch(() => {
        if (canceled) return;
        setUser(null);
        setToken(null);
      });

    return () => {
      canceled = true;
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
    } catch {
      setUser(null);
      setToken(null);
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

import React, { createContext, useContext, useEffect, useState } from "react";
import { API_BASE } from "@/lib/config";

type User = {
  id: string;
  username: string;
  discordId?: string;
  avatar?: string | null;
  banner?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  logout: () => void;
  updateProfile: (data: FormData) => Promise<User>;
  handleAuthCallback: (token: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("token"),
  );

  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => setUser(data))
        .catch(() => {
          setUser(null);
          setToken(null);
          localStorage.removeItem("token");
        });
    }
  }, [token]);

  const handleAuthCallback = async (newToken: string) => {
    setToken(newToken);
    localStorage.setItem("token", newToken);

    // Fetch user profile with the new token
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${newToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = await res.json();
      setUser(data);
    } catch (err) {
      console.error("Error fetching user:", err);
      setUser(null);
      setToken(null);
      localStorage.removeItem("token");
    }
  };

  const logout = () => {
    if (token) {
      fetch(`${API_BASE}/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem("token");
  };

  const updateProfile = async (formData: FormData) => {
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(`${API_BASE}/me`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error("Update failed");
    const data = await res.json();
    setUser(data);
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

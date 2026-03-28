import { createContext, useContext, useEffect, useState } from "react";
import { User, api } from "./api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  refreshUserBalance: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const userData = localStorage.getItem("auth_user");

    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData);
        // Validate token is still valid server-side
        api
          .getMe()
          .then((serverUser) => {
            setUser({ ...parsedUser, ...serverUser, token });
          })
          .catch(() => {
            // Token is stale/invalid — clear it
            localStorage.removeItem("auth_token");
            localStorage.removeItem("auth_user");
          })
          .finally(() => {
            setIsLoading(false);
          });
        return;
      } catch {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
      }
    }

    setIsLoading(false);
  }, []);

  // Listen for 401 events dispatched by api client
  useEffect(() => {
    const handleAuthLogout = () => {
      setUser(null);
    };
    window.addEventListener("auth:logout", handleAuthLogout);
    return () => window.removeEventListener("auth:logout", handleAuthLogout);
  }, []);

  const login = (newUser: User) => {
    setUser(newUser);
    localStorage.setItem("auth_token", newUser.token);
    localStorage.setItem(
      "auth_user",
      JSON.stringify({
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        balance: newUser.balance,
      }),
    );
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  };

  const refreshUserBalance = async () => {
    try {
      const serverUser = await api.getMe();
      setUser((currentUser) => (currentUser ? { ...currentUser, balance: serverUser.balance } : null));
      // Also update localStorage
      const userData = localStorage.getItem("auth_user");
      if (userData) {
        const parsed = JSON.parse(userData);
        localStorage.setItem(
          "auth_user",
          JSON.stringify({ ...parsed, balance: serverUser.balance }),
        );
      }
    } catch (error) {
      console.error("Failed to refresh user balance:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
        refreshUserBalance,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

import { createContext, useContext, useState } from "react";
import { authAPI } from "../services/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = sessionStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });

  // Login — may return { requires2FA: true } if 2FA is enabled
  const login = async (email, password) => {
    const res = await authAPI.login(email, password);

    // If 2FA is required, return partial data (caller handles 2FA step)
    if (res.requires2FA) {
      return { requires2FA: true, tempToken: res.tempToken, user: res.user };
    }

    // Normal login — store token and user
    sessionStorage.setItem("token", res.token);
    sessionStorage.setItem("user", JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  };

  // Complete 2FA verification
  const verify2FA = async (Admin_ID, code, tempToken) => {
    const res = await authAPI.verify2FALogin(Admin_ID, code, tempToken);
    sessionStorage.setItem("token", res.token);
    sessionStorage.setItem("user", JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, verify2FA, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

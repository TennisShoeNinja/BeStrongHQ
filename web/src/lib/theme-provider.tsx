"use client";

import { createContext, useContext } from "react";

type Mode = "dark";
type ResolvedMode = "dark";

interface ThemeContextType {
  mode: Mode;
  resolvedMode: ResolvedMode;
  setMode: (mode: Mode) => Promise<void>;
  isLoading: boolean;
}

const value: ThemeContextType = {
  mode: "dark",
  resolvedMode: "dark",
  setMode: async () => {},
  isLoading: false,
};

const ThemeContext = createContext<ThemeContextType>(value);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

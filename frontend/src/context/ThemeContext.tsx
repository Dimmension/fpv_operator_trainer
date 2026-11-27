import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeType = 
  | "apple" 
  | "earthy" 
  | "sunset" 
  | "ocean" 
  | "tactical" 
  | "nordic";

export interface ThemeOption {
  id: ThemeType;
  title: string;
  badge: string;
  palette: string[];
}

export const THEMES: ThemeOption[] = [
  { id: "apple", title: "Apple Modern", badge: "Pill / Glass", palette: ["#F5F5F7", "#0071E3", "#1D1D1F"] },
  { id: "earthy", title: "Earthy Minimal", badge: "Warm Craft", palette: ["#F8F6EE", "#C96F4F", "#2E3A2F"] },
  { id: "sunset", title: "Vibrant Sunset", badge: "Neo-Glow", palette: ["#1F1423", "#BE5CA9", "#FDF7FD"] },
  { id: "ocean", title: "Ocean Breeze", badge: "Marine Tech", palette: ["#061324", "#3BA7F2", "#7FE7D6"] },
  { id: "tactical", title: "Tactical HUD", badge: "FPV Carbon", palette: ["#080B0D", "#38D9A9", "#D3DFE4"] },
  { id: "nordic", title: "Nordic Frost", badge: "Slate Cold", palette: ["#0F1216", "#3B82F6", "#F1F3F5"] },
];

interface ThemeContextProps {
  currentTheme: ThemeType;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextProps>({
  currentTheme: "apple",
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>(() => {
    return (localStorage.getItem("fpv_theme") as ThemeType) || "apple";
  });

  const setTheme = (theme: ThemeType) => {
    setCurrentTheme(theme);
    localStorage.setItem("fpv_theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", currentTheme);
  }, [currentTheme]);

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
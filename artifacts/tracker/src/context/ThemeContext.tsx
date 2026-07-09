import { createContext, useContext, useEffect, useState } from "react"

export type AccentTheme = "red" | "green"

interface ThemeContextValue {
  accent: AccentTheme
  setAccent: (t: AccentTheme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  accent: "red",
  setAccent: () => {},
})

const STORAGE_KEY = "discwatchhq-accent"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentTheme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved === "green" ? "green" : "red"
    } catch {
      return "red"
    }
  })

  useEffect(() => {
    const root = document.documentElement
    // Always dark
    root.classList.add("dark")
    // Swap accent class
    root.classList.toggle("theme-green", accent === "green")
    try {
      localStorage.setItem(STORAGE_KEY, accent)
    } catch {}
  }, [accent])

  const setAccent = (t: AccentTheme) => setAccentState(t)

  return (
    <ThemeContext.Provider value={{ accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

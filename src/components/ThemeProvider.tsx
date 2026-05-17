import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import type { ThemeMode } from "@/types";

const STORAGE_KEY = "shiftvault.theme";

interface ThemeContextValue {
	mode: ThemeMode;
	resolved: "light" | "dark";
	setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialMode(): ThemeMode {
	if (typeof window === "undefined") return "system";
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (stored === "light" || stored === "dark" || stored === "system") return stored;
	return "system";
}

function resolve(mode: ThemeMode): "light" | "dark" {
	if (mode !== "system") return mode;
	if (typeof window === "undefined") return "light";
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyClass(resolved: "light" | "dark") {
	const root = document.documentElement;
	root.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [mode, setModeState] = useState<ThemeMode>(readInitialMode);
	const [resolved, setResolved] = useState<"light" | "dark">(() => resolve(readInitialMode()));

	useEffect(() => {
		const next = resolve(mode);
		setResolved(next);
		applyClass(next);
		try {
			window.localStorage.setItem(STORAGE_KEY, mode);
		} catch {
			/* localStorage unavailable — non-fatal */
		}
	}, [mode]);

	useEffect(() => {
		if (mode !== "system") return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => {
			const next = media.matches ? "dark" : "light";
			setResolved(next);
			applyClass(next);
		};
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [mode]);

	const setMode = useCallback((next: ThemeMode) => setModeState(next), []);

	return (
		<ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
	return ctx;
}

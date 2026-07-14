"use client";

import { useEffect, useState } from "react";
import type { ThemeName } from "../lib/library/types";

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export const THEME_STORAGE_KEY = "plot-pile-theme";
export const THEMES: { id: ThemeName; name: string; description: string; color: string }[] = [
  { id: "bookshop", name: "Bookshop", description: "Berry & paper", color: "#7c2942" },
  { id: "forest", name: "Forest", description: "Sage & moss", color: "#355d45" },
  { id: "ocean", name: "Ocean", description: "Teal & sea glass", color: "#1e6072" },
  { id: "lavender", name: "Lavender", description: "Plum & lilac", color: "#69406f" },
];

export function useDeviceSettings(showNotice: (message: string) => void) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() =>
    typeof window !== "undefined" && (
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    ),
  );
  const [isIos] = useState(() => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent));
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  const [canPersistStorage] = useState(() => typeof navigator !== "undefined" && Boolean(navigator.storage?.persist));
  const [theme, setTheme] = useState<ThemeName>(() => {
    if (typeof window === "undefined") return "bookshop";
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.some((item) => item.id === saved) ? saved as ThemeName : "bookshop";
  });

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    if (navigator.storage?.persisted) void navigator.storage.persisted().then(setStoragePersistent);
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      THEMES.find((item) => item.id === theme)?.color ?? "#7c2942",
    );
  }, [theme]);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") showNotice("Plot Pile installed");
    setInstallPrompt(null);
  }

  async function protectStorage() {
    if (!navigator.storage?.persist) return;
    const persistent = await navigator.storage.persist();
    setStoragePersistent(persistent);
    showNotice(persistent ? "Browser storage protection enabled" : "The browser kept its normal storage policy");
  }

  return {
    theme,
    setTheme,
    installPrompt,
    isInstalled,
    isIos,
    storagePersistent,
    canPersistStorage,
    installApp,
    protectStorage,
  };
}


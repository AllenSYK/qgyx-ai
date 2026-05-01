"use client";

import { useCallback, useEffect, useState } from "react";
import { Languages } from "lucide-react";
import clsx from "clsx";
import type { AppLanguage } from "@/lib/language";
import { normalizeLanguage } from "@/lib/language";

const STORAGE_KEY = "qgyx:language";
const CHANGE_EVENT = "qgyx-language-change";

export function getStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") {
    return "zh";
  }

  return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY));
}

export function setStoredLanguage(language: AppLanguage) {
  if (typeof window === "undefined") {
    return;
  }

  const nextLanguage = normalizeLanguage(language);
  window.localStorage.setItem(STORAGE_KEY, nextLanguage);
  window.dispatchEvent(new CustomEvent<AppLanguage>(CHANGE_EVENT, { detail: nextLanguage }));
}

export function useLanguagePreference() {
  const [language, setLanguage] = useState<AppLanguage>("zh");

  useEffect(() => {
    setLanguage(getStoredLanguage());

    function sync(event: Event) {
      const custom = event as CustomEvent<AppLanguage>;
      setLanguage(normalizeLanguage(custom.detail || window.localStorage.getItem(STORAGE_KEY)));
    }

    function syncStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        setLanguage(normalizeLanguage(event.newValue));
      }
    }

    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", syncStorage);

    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  const updateLanguage = useCallback((next: AppLanguage) => {
    setLanguage(next);
    setStoredLanguage(next);
  }, []);

  return { language, setLanguage: updateLanguage };
}

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguagePreference();

  return (
    <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1 text-sm font-semibold text-slate-700 shadow-sm">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500">
        <Languages className="h-4 w-4" />
      </span>
      {[
        ["zh", "中文"],
        ["en", "English"]
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setLanguage(value as AppLanguage)}
          className={clsx(
            "rounded-xl px-3 py-1.5 transition",
            language === value ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

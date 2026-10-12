/// <reference types="vite/client" />

/** gomez-ui.js (loaded from /static in index.html) */
interface Window {
  gomezUI?: {
    isDark(): boolean;
    setTheme(mode: "auto" | "light" | "dark"): void;
    setUpdated(el: HTMLElement, iso?: string | null, error?: string | null): void;
    renderUpdated(): void;
  };
}

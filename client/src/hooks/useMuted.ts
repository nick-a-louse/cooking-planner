import { useCallback, useState } from "react";

const KEY = "cookplan-muted";

/** Alert sounds on/off, remembered on this device only (each cook chooses for their own phone). */
export function useMuted(): [boolean, () => void] {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setMuted((m) => {
      try {
        if (m) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, "1");
      } catch {
        // Private browsing etc.: still works for this visit.
      }
      return !m;
    });
  }, []);
  return [muted, toggle];
}

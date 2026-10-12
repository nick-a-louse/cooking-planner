import { useEffect, useRef, type ReactNode } from "react";
import { BUILD } from "../utils/version";

interface Props {
  title: ReactNode;
  /** ISO time of the last successful save. null = still loading. */
  updatedIso: string | null;
  /** Shown instead of a time when there's nothing to date yet, e.g. "No plans yet". */
  emptyText?: string;
  /** The last save failed: the line turns red and shows this on hover. */
  updatedError?: string | null;
  /** App buttons, placed before the theme button. */
  children?: ReactNode;
}

/** A save never goes stale on its own, so the freshness limits are effectively infinite. */
const NEVER = "1000000000";

/** gomez-ui header: logo, title with the Updated line under it, app actions, theme button. */
export default function AppHeader({ title, updatedIso, emptyText, updatedError, children }: Props) {
  const updatedRef = useRef<HTMLParagraphElement>(null);
  const showTime = updatedIso !== null && !(emptyText && !updatedIso);

  useEffect(() => {
    // gomez-ui owns this element's text, so React renders it empty and never touches it again.
    if (showTime && updatedRef.current) window.gomezUI?.setUpdated(updatedRef.current, updatedIso, updatedError);
  }, [showTime, updatedIso, updatedError]);

  return (
    <header className="g-header">
      <div className="wrap g-header-row">
        <div className="g-brand">
          <img className="g-app-icon" src={`/static/icon.svg?v=${BUILD}`} alt="" />
          <div className="g-titles">
            <h1 className="g-title">{title}</h1>
            {showTime ? (
              <p key="time" ref={updatedRef} className="g-updated" data-ok-mins={NEVER} data-stale-mins={NEVER} />
            ) : (
              <p key="placeholder" className="g-updated-pending">
                {updatedIso === null ? "Loading…" : emptyText}
              </p>
            )}
          </div>
        </div>
        <div className="g-actions">
          {children}
          <ThemeButton />
        </div>
      </div>
    </header>
  );
}

/** Cycles Auto → Light → Dark; gomez-ui.js handles the click and shows the matching icon. */
function ThemeButton() {
  return (
    <button className="btn btn-icon g-theme" type="button" aria-label="Theme">
      <svg data-icon="auto" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
      </svg>
      <svg data-icon="light" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
      </svg>
      <svg data-icon="dark" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" fill="currentColor" />
      </svg>
    </button>
  );
}

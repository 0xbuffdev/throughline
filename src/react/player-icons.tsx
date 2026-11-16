import type * as React from "react";

/** Icon shapes ported directly from the player design prototype. */
export type IconName =
  | "back"
  | "check"
  | "chevron"
  | "expand"
  | "shrink"
  | "focus"
  | "forward"
  | "home"
  | "inspect"
  | "minus"
  | "narrate"
  | "options"
  | "pause"
  | "play"
  | "plus"
  | "restart"
  | "sound"
  | "soundOff"
  | "collapse"
  | "uncollapse"
  | "fit";

const SPEEDS = [0.5, 1, 2] as const;
const BASE_STEP_MS = 1500;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;

const ICONS: Record<IconName, React.ReactNode> = {
  back: (
    <>
      <path d="M5 4v16" />
      <path d="m18 5-9 7 9 7Z" />
    </>
  ),
  forward: (
    <>
      <path d="M19 4v16" />
      <path d="m6 5 9 7-9 7Z" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7Z" />,
  pause: (
    <>
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4Z" />
      <path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4Z" />
      <path d="m17 9 5 6m0-6-5 6" />
    </>
  ),
  narrate: (
    <>
      <path d="M4 7h8M4 12h6M4 17h7" />
      <path d="M16 8a4 4 0 0 1 0 8M18.5 5a8 8 0 0 1 0 14" />
    </>
  ),
  expand: <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />,
  shrink: <path d="M3 9h6V3M21 9h-6V3M3 15h6v6M21 15h-6v6" />,
  inspect: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 5 5" />
      <path d="M11 8v6m-3-3h6" />
    </>
  ),
  chevron: <path d="m8 10 4 4 4-4" />,
  options: <path d="M4 7h9m4 0h3M4 12h3m4 0h9M4 17h11m4 0h1M15 4v6M9 9v6M17 14v6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fit: <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />,
  focus: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v5m0 10v5M2 12h5m10 0h5" />
    </>
  ),
  restart: <path d="M4 12a8 8 0 1 1 2.4 5.7M4 6v6h6" />,
  home: <path d="M3 10 12 3l9 7v11H3V10zm6 11v-8h6v8" />,
  collapse: <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />,
  uncollapse: <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};

export function PlayerIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name]}
      </g>
    </svg>
  );
}


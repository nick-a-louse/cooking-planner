/**
 * The app's 20-colour jewel palette, ordered as a hue spectrum for the
 * swatch picker. All tones sit in the dark register so white bar labels
 * stay readable in light and dark mode.
 */
export const PALETTE: readonly string[] = [
  "#A03A3A", // crimson
  "#8E3B46", // burgundy
  "#A04466", // raspberry
  "#7B4468", // plum
  "#6E5A6E", // mauve
  "#56497E", // violet
  "#4C5B9A", // indigo
  "#305F8A", // sapphire
  "#47657F", // steel
  "#2F6B6B", // teal
  "#1F6E5E", // emerald
  "#3A6B4A", // forest
  "#5C6B35", // olive
  "#7A6230", // bronze
  "#94742C", // ochre
  "#A15E2E", // copper
  "#9C4A2F", // rust
  "#8F4A3A", // brick
  "#4E5A5E", // slate
  "#77706A", // stone
];

export const DEFAULT_TASK_COLOR = "#4E5A5E";

/** First palette colour not already in use, cycling if everything is taken. */
export function nextUnusedColor(used: Iterable<string>): string {
  const usedSet = new Set([...used].map((c) => c.toLowerCase()));
  return PALETTE.find((c) => !usedSet.has(c.toLowerCase())) ?? PALETTE[usedSet.size % PALETTE.length];
}

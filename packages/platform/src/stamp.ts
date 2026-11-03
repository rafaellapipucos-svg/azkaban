/** Text and geometry of the stamp (ADR-0007, section 6). Pure: web draws it on a canvas, native renders the same numbers. */

export type StampText = {
  capturedAt: Date;
  taskTitle: string;
  userName: string;
  locale: string;
  timeZone?: string;
};

/** Date and time of the device, then the task, then the user. */
export function stampLines(input: StampText): string[] {
  const when = new Intl.DateTimeFormat(input.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
    ...(input.timeZone ? { timeZone: input.timeZone } : {}),
  }).format(input.capturedAt);
  return [when, input.taskTitle.trim(), input.userName.trim()];
}

/**
 * Colors burned into the photo, and the letterbox around the preview. They are part of the image, not
 * of the theme, so they are the same in light and dark. `@azkaban/ui` depends on this package, so its
 * tokens cannot be imported here.
 */
export const stampColors = {
  band: 'rgba(0, 0, 0, 0.6)',
  text: '#FFFFFF',
  letterbox: '#000000',
} as const;

/** Sizes follow the short edge, so the stamp reads the same at 1600 px and after a shrink to 600. */
export function stampMetrics(width: number, height: number) {
  const fontSize = Math.round(Math.min(40, Math.max(12, Math.min(width, height) * 0.032)));
  return { fontSize, lineHeight: Math.round(fontSize * 1.3), padding: Math.round(fontSize * 0.6) };
}

export type StampLayout = {
  fontSize: number;
  band: { x: number; y: number; width: number; height: number };
  lines: { text: string; x: number; y: number }[];
};

/** Cuts `text` with an ellipsis until `measure` says it fits `maxWidth`. */
export function ellipsize(text: string, maxWidth: number, measure: (text: string) => number) {
  if (measure(text) <= maxWidth) return text;
  const chars = Array.from(text); // code points, so an emoji is never split
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(`${chars.slice(0, mid).join('').trimEnd()}…`) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${chars.slice(0, low).join('').trimEnd()}…`;
}

/** A band across the bottom of the image, one line of text per row. `measure` gets the text and the font size. */
export function layoutStamp(
  width: number,
  height: number,
  lines: string[],
  measure: (text: string, fontSize: number) => number,
): StampLayout {
  const { fontSize, lineHeight, padding } = stampMetrics(width, height);
  const bandHeight = lines.length * lineHeight + 2 * padding;
  const top = height - bandHeight;
  return {
    fontSize,
    band: { x: 0, y: top, width, height: bandHeight },
    lines: lines.map((line, i) => ({
      text: ellipsize(line, width - 2 * padding, (t) => measure(t, fontSize)),
      x: padding,
      y: top + padding + i * lineHeight,
    })),
  };
}

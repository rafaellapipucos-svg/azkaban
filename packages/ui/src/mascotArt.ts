// Broto's geometry in a 120 by 120 box, shared by <Mascot> and the app icons
// (scripts/render-brand.mjs). No runtime imports on purpose: Node 24 loads this file as is.

export const mascotBox = 120;
/** How far the drawing reaches from the middle of the box (the tip of the left leaf), in box units. */
export const mascotReach = 55;

export const mascotShapes = {
  leaves: ['M60 26 Q58 12 44 8 Q44 24 60 26 Z', 'M60 26 Q62 14 78 12 Q76 26 60 26 Z'],
  body: { cx: 60, cy: 68, rx: 42, ry: 44 },
  belly: { cx: 60, cy: 84, rx: 26, ry: 24 },
  eyes: { y: 56, r: 11, pupil: 6, x: [42, 78] },
  closedEyes: ['M36 56 Q42 62 48 56', 'M72 56 Q78 62 84 56'],
  blush: { y: 70, r: 6, x: [28, 92], opacity: 0.7 },
  mouths: {
    happy: 'M50 70 Q60 80 70 70',
    celebrating: 'M46 66 Q60 88 74 66 Z',
    worried: 'M50 76 Q60 68 70 76',
    sleeping: 'M54 74 Q60 77 66 74',
  },
  stroke: 4,
} as const;

type MascotPalette = {
  body: string;
  belly: string;
  leaf: string;
  ink: string;
  blush: string;
  eye: string;
};

const s = mascotShapes;
const ellipse = (e: { cx: number; cy: number; rx: number; ry: number }, fill: string) =>
  `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="${fill}"/>`;
const leaves = (fill: string) => s.leaves.map((d) => `<path d="${d}" fill="${fill}"/>`).join('');

/** Happy Broto in full colour, as SVG markup in the 120 box. */
export function brotoMarkup(c: MascotPalette) {
  const eyes = s.eyes.x
    .map(
      (x) =>
        `<circle cx="${x}" cy="${s.eyes.y}" r="${s.eyes.r}" fill="${c.eye}"/>` +
        `<circle cx="${x + 2}" cy="${s.eyes.y}" r="${s.eyes.pupil}" fill="${c.ink}"/>`,
    )
    .join('');
  const blush = s.blush.x
    .map(
      (x) =>
        `<circle cx="${x}" cy="${s.blush.y}" r="${s.blush.r}" fill="${c.blush}" opacity="${s.blush.opacity}"/>`,
    )
    .join('');
  return (
    leaves(c.leaf) +
    ellipse(s.body, c.body) +
    ellipse(s.belly, c.belly) +
    eyes +
    blush +
    `<path d="${s.mouths.happy}" stroke="${c.ink}" stroke-width="${s.stroke}" stroke-linecap="round" fill="none"/>`
  );
}

/**
 * One colour, eyes and smile cut out: what Android wants for the themed icon and the
 * notification icon, which only read the alpha.
 */
export function brotoSilhouette(fill: string) {
  const holes =
    s.eyes.x
      .map((x) => `<circle cx="${x}" cy="${s.eyes.y}" r="${s.eyes.r}" fill="#000"/>`)
      .join('') +
    `<path d="${s.mouths.happy}" stroke="#000" stroke-width="${s.stroke * 1.5}" stroke-linecap="round" fill="none"/>`;
  return (
    `<mask id="cut"><rect width="${mascotBox}" height="${mascotBox}" fill="#fff"/>${holes}</mask>` +
    `<g mask="url(#cut)">${leaves(fill)}${ellipse(s.body, fill)}</g>`
  );
}

export type BrandAsset = {
  file: string;
  size: number;
  /** Opaque fill behind Broto; none means transparent. */
  background?: string;
  /** Share of the canvas the 120 box takes, centred. */
  fit: number;
  art: string;
};

/** The whole drawing as a square SVG of `size` pixels. */
export function brandSvg({ size, background, fit, art }: BrandAsset) {
  const scale = (size * fit) / mascotBox;
  const offset = (size - size * fit) / 2;
  const fill = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `${fill}<g transform="translate(${offset} ${offset}) scale(${scale})">${art}</g></svg>`
  );
}

/** Radius of a circle centred on the canvas that holds the whole drawing, as a share of the side. */
export function reachOf({ fit }: Pick<BrandAsset, 'fit'>) {
  return (fit * mascotReach) / mascotBox;
}

/**
 * Every icon and splash file Expo and the web manifest ask for. Safe zones: the Android adaptive
 * icon shows a circle of 66 of its 108 dp, a maskable web icon a circle of 80% of the side.
 */
export function brandAssets(t: { background: string; mascot: MascotPalette; silhouette: string }) {
  const color = brotoMarkup(t.mascot);
  const onBackground = (file: string, size: number, fit = 0.8): BrandAsset => ({
    file,
    size,
    fit,
    background: t.background,
    art: color,
  });
  return [
    onBackground('icon.png', 1024),
    { file: 'android-icon-foreground.png', size: 1024, fit: 0.64, art: color },
    {
      file: 'android-icon-monochrome.png',
      size: 1024,
      fit: 0.64,
      art: brotoSilhouette(t.silhouette),
    },
    { file: 'splash-icon.png', size: 1024, fit: 1, art: color },
    // White on transparent: Android tints it; 96 px is the xxxhdpi size of a 24 dp icon.
    { file: 'notification-icon.png', size: 96, fit: 0.95, art: brotoSilhouette('#FFFFFF') },
    { file: 'favicon.png', size: 48, fit: 1, art: color },
    onBackground('icon-192.png', 192),
    onBackground('icon-512.png', 512),
    onBackground('icon-maskable-512.png', 512, 0.72),
    onBackground('apple-touch-icon.png', 180),
  ] satisfies BrandAsset[];
}

// Order matters: Edge and Opera also say Chrome, and Chrome also says Safari.
const browsers: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const systems: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Linux/, 'Linux'],
];

const first = (list: [RegExp, string][], text: string) =>
  list.find(([pattern]) => pattern.test(text))?.[1] ?? null;

/** Browser and system of a user agent, to tell devices apart in a list. Null parts are unknown. */
export function deviceLabel(userAgent: string | null) {
  if (!userAgent) return { browser: null, system: null };
  return { browser: first(browsers, userAgent), system: first(systems, userAgent) };
}

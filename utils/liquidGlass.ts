/**
 * Liquid glass: an SVG displacement map that bends the backdrop near the rim.
 * Only Chromium (desktop Chrome/Edge and the Android WebView) accepts
 * `backdrop-filter: url(#id)`; elsewhere the plain blur from `.glass` is used.
 */
export interface LiquidGlassOptions {
  bezel?: number;
  scale?: number;
}

let cachedSupport: boolean | null = null;

export function supportsLiquidGlass(): boolean {
  if (cachedSupport !== null) return cachedSupport;
  if (typeof navigator === 'undefined') return (cachedSupport = false);
  const ua = navigator.userAgent;
  cachedSupport = /Chrome\/|Chromium\//.test(ua) && !/Firefox\//.test(ua);
  return cachedSupport;
}

/** Data URI for a w x h rounded-rect displacement map (red = x, green = y, neutral inside). */
export function displacementMapUri(w: number, h: number, r: number, bezel: number): string {
  const inner = `<rect x='${bezel}' y='${bezel}' width='${w - 2 * bezel}' height='${h - 2 * bezel}' rx='${Math.max(0, r - bezel)}' fill='rgb(128,128,0)' filter='url(%23b)'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><defs><linearGradient id='r' x1='0' x2='1'><stop offset='0' stop-color='rgb(255,0,0)'/><stop offset='1' stop-color='rgb(0,0,0)'/></linearGradient><linearGradient id='g' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='rgb(0,255,0)'/><stop offset='1' stop-color='rgb(0,0,0)'/></linearGradient><filter id='b'><feGaussianBlur stdDeviation='${bezel / 2}'/></filter></defs><rect width='${w}' height='${h}' fill='url(%23r)'/><rect width='${w}' height='${h}' fill='url(%23g)' style='mix-blend-mode:screen'/>${inner}</svg>`;
  return 'data:image/svg+xml,' + svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'").replace(/ /g, '%20');
}

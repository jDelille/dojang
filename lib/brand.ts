/**
 * White-label accent handling.
 *
 * A buyer sets one color in Settings → Branding. Remapping only
 * `--color-accent` leaves `--color-accent-dark` (hover/pressed) amber and
 * `--color-accent-fg` near-black, so a dark brand color produced an
 * amber flash on hover and unreadable button text. Both are derived here.
 *
 * The value is also inlined into a <style> tag, so it must be validated —
 * an unchecked string would let a workspace admin inject arbitrary CSS.
 */

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface BrandTokens {
  accent: string;
  accentDark: string;
  accentFg: string;
}

function parseHex(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null;
  let body = hex.slice(1);
  if (body.length === 3) body = body.replace(/./g, (c) => c + c);
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
}

const toHex = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** WCAG relative luminance — decides whether text on the accent is light or dark. */
function luminance([r, g, b]: [number, number, number]) {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Derives the full accent triple from a single brand color.
 * Returns null for anything that is not a plain hex value, so callers fall
 * back to the default palette rather than emitting attacker-controlled CSS.
 */
export function brandTokens(accentColor?: string | null): BrandTokens | null {
  if (!accentColor) return null;
  const rgb = parseHex(accentColor.trim());
  if (!rgb) return null;

  const [r, g, b] = rgb;

  // Hover/pressed: 16% darker. Very dark brands get *lighter* instead, or
  // the hover state would be indistinguishable from the resting one.
  const lum = luminance(rgb);
  const factor = lum < 0.06 ? 1.35 : 0.84;
  const accentDark = `#${toHex(r * factor)}${toHex(g * factor)}${toHex(b * factor)}`;

  // Text sitting on the accent fill. Compare contrast both ways rather than
  // guessing from a fixed luminance threshold.
  const contrast = (other: number) =>
    (Math.max(lum, other) + 0.05) / (Math.min(lum, other) + 0.05);
  const accentFg = contrast(1) >= contrast(0) ? '#ffffff' : '#141414';

  return { accent: `#${toHex(r)}${toHex(g)}${toHex(b)}`, accentDark, accentFg };
}

/** Ready-to-inline CSS, or an empty string when the color is unusable. */
export function brandStyle(accentColor?: string | null): string {
  const t = brandTokens(accentColor);
  if (!t) return '';
  return `:root{--color-accent:${t.accent};--color-accent-dark:${t.accentDark};--color-accent-fg:${t.accentFg};}`;
}

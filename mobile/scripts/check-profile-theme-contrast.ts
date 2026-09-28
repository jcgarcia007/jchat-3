// Node's native TypeScript loader requires the explicit extension.
// @ts-expect-error allowImportingTsExtensions is intentionally not enabled app-wide.
import { PROFILE_THEMES } from '../theme/profileThemes.ts';

const MIN_CONTRAST = 4.5;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

let failures = 0;

for (const theme of PROFILE_THEMES) {
  const pairs = [
    ['bodyText', theme.bodyText, theme.statsBg],
    ['bodyTextSecondary', theme.bodyTextSecondary, theme.statsBg],
    ['tabInactiveText', theme.tabInactiveText, theme.statsBg],
    ['tabActive', theme.tabActive, theme.statsBg],
    ['btn1Color', theme.btn1Color, theme.btn1Bg],
  ] as const;

  const results = pairs.map(([label, foreground, background]) => {
    const ratio = contrast(foreground, background);
    if (ratio < MIN_CONTRAST) failures += 1;
    return `${label} ${ratio.toFixed(2)}:1`;
  });

  const themePasses = pairs.every(([, foreground, background]) => contrast(foreground, background) >= MIN_CONTRAST);
  console.log(`Theme ${theme.id} (${theme.name}): ${themePasses ? 'PASS' : 'FAIL'} — ${results.join(', ')}`);
}

if (failures > 0) {
  console.error(`FAIL — ${failures} profile-theme contrast pair(s) below ${MIN_CONTRAST}:1.`);
  process.exitCode = 1;
} else {
  console.log(`PASS — all ${PROFILE_THEMES.length * 5} profile-theme contrast pairs meet ${MIN_CONTRAST}:1.`);
}

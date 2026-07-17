// Font sizes mirror the website's display scale (tailwind.config.ts
// fontSize.display-*), condensed for mobile screen widths.

export const type = {
  displayLg: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.5, lineHeight: 38 },
  displayMd: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.3, lineHeight: 32 },
  displaySm: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: 28 },
  h1: { fontSize: 20, fontWeight: '700' as const, lineHeight: 26 },
  h2: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
  small: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '500' as const, lineHeight: 15, letterSpacing: 0.3 },
}

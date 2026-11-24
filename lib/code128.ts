// Minimal Code 128 (subset B) encoder — returns the bar/space module widths
// for a string so it can be drawn as vector rects (react-pdf <Svg>/<Rect> or
// HTML/SVG). No dependency; ASCII 32–126 only (GC numbers like MUM26CM072-01).
const PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232',
]
const STOP = '2331112'

/** Returns module widths alternating bar, space, bar, … (starts with a bar). */
export function code128B(text: string): number[] {
  const START_B = 104
  const values: number[] = [START_B]
  for (const ch of text) {
    const c = ch.charCodeAt(0)
    values.push(c >= 32 && c <= 126 ? c - 32 : 0)
  }
  let sum = START_B
  for (let i = 1; i < values.length; i++) sum += values[i] * i
  values.push(sum % 103)
  const widths: number[] = []
  for (const v of values) for (const d of PATTERNS[v]) widths.push(Number(d))
  for (const d of STOP) widths.push(Number(d))
  return widths
}

/** Bars as [x, width] module pairs plus the total module count. */
export function code128Bars(text: string): { bars: { x: number; w: number }[]; modules: number } {
  const widths = code128B(text)
  const bars: { x: number; w: number }[] = []
  let x = 0
  widths.forEach((w, i) => { if (i % 2 === 0) bars.push({ x, w }); x += w })
  return { bars, modules: x }
}

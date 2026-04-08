/**
 * Chart color palette — uses CSS custom properties so colors adapt to the
 * active theme (amber vs WHOOP).  The tokens are defined in globals.css.
 *
 * Semantic mapping:
 *   amazon → volume & energy (amber: orange, whoop: green)
 *   adobe  → intensity & strain (amber: red, whoop: red)
 *   un     → recovery & sleep (amber: blue, whoop: emerald)
 *   cal    → speed & pace (amber: gold, whoop: yellow)
 *   gia    → body & heart (amber: pink, whoop: teal)
 */
export const chartPalette = {
  amazon: "var(--chart-volume)",
  adobe: "var(--chart-intensity)",
  un: "var(--chart-recovery)",
  cal: "var(--chart-pace)",
  gia: "var(--chart-body)",
} as const;

export type ChartSemantic =
  | "volume"
  | "intensity"
  | "recovery"
  | "pace"
  | "body"
  | "secondary";

export function colorForSemantic(role: ChartSemantic): string {
  switch (role) {
    case "volume":
      return chartPalette.amazon;
    case "intensity":
      return chartPalette.adobe;
    case "recovery":
      return chartPalette.un;
    case "pace":
      return chartPalette.cal;
    case "body":
      return chartPalette.gia;
    case "secondary":
      return chartPalette.cal;
    default:
      return chartPalette.amazon;
  }
}

export const seriesByIndex = [
  chartPalette.amazon,
  chartPalette.un,
  chartPalette.cal,
  chartPalette.adobe,
  chartPalette.gia,
] as const;

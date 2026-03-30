/**
 * Brand palette — assign by meaning so charts read as a story, not rainbow noise.
 * Amazon: volume & energy · Adobe: intensity & stress · UN: recovery & sleep
 * Cal: speed & pace · Gia: body & heart (softer signals)
 */
export const chartPalette = {
  amazon: "#FF9900",
  adobe: "#FF0000",
  un: "#009EDB",
  cal: "#FDB515",
  gia: "#efbbcc",
} as const;

export type ChartSemantic =
  | "volume"
  | "intensity"
  | "recovery"
  | "pace"
  | "body"
  | "secondary";

/** Default stroke/fill per semantic role */
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

/** Multi-series: order matters for legends (distinct hues). */
export const seriesByIndex = [
  chartPalette.amazon,
  chartPalette.un,
  chartPalette.cal,
  chartPalette.adobe,
  chartPalette.gia,
] as const;

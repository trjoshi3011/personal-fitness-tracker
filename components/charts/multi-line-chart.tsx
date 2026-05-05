"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

export type LineConfig = {
  dataKey: string;
  color: string;
  name?: string;
  yAxisId?: string;
  unit?: string;
  strokeDasharray?: string;
  showDots?: boolean;
};

export type ReferenceLineConfig = {
  /** x-axis category value (must match an x value present in `data`). */
  x: string | number;
  label?: string;
  color?: string;
};

export function MultiLineChartView({
  data,
  xKey,
  lines,
  height = 220,
  yDomain,
  rightYDomain,
  referenceLines,
  hideXTicks,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  lines: LineConfig[];
  height?: number;
  yDomain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
  rightYDomain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
  referenceLines?: ReferenceLineConfig[];
  hideXTicks?: boolean;
}) {
  if (data.length === 0) {
    return (
      <div
        className="grid place-items-center text-sm text-stone-400"
        style={{ height }}
      >
        No data yet
      </div>
    );
  }
  const hasRight = lines.some((l) => l.yAxisId === "right");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 4, right: hasRight ? 4 : 4, bottom: 0, left: -12 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey={xKey}
          tick={hideXTicks ? false : { fontSize: 11, fill: "var(--chart-axis-text)" }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: "var(--chart-axis-text)" }}
          tickLine={false}
          axisLine={false}
          domain={yDomain}
        />
        {hasRight && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: "var(--chart-axis-text)" }}
            tickLine={false}
            axisLine={false}
            domain={rightYDomain}
          />
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-tooltip-border)",
            borderRadius: 12,
            fontSize: 12,
            color: "var(--chart-tooltip-text)",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          iconSize={10}
          iconType="circle"
        />
        {referenceLines?.map((rl, i) => (
          <ReferenceLine
            key={`ref-${i}`}
            x={rl.x}
            yAxisId="left"
            stroke={rl.color ?? "var(--chart-grid)"}
            strokeDasharray="2 4"
            label={
              rl.label
                ? {
                    value: rl.label,
                    position: "insideTopRight",
                    fill: "var(--chart-axis-text)",
                    fontSize: 10,
                  }
                : undefined
            }
          />
        ))}
        {lines.map((l) => (
          <Line
            key={l.dataKey}
            type="monotone"
            dataKey={l.dataKey}
            name={l.name ?? l.dataKey}
            stroke={l.color}
            strokeWidth={2}
            strokeDasharray={l.strokeDasharray}
            yAxisId={l.yAxisId ?? "left"}
            dot={
              l.showDots === false
                ? false
                : { r: 2.5, fill: l.color, strokeWidth: 0 }
            }
            activeDot={l.showDots === false ? false : { r: 4.5, strokeWidth: 0 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

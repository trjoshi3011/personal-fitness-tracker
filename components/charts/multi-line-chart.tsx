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
} from "recharts";

export type LineConfig = {
  dataKey: string;
  color: string;
  name?: string;
  yAxisId?: string;
  unit?: string;
};

export function MultiLineChartView({
  data,
  xKey,
  lines,
  height = 220,
  yDomain,
  rightYDomain,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  lines: LineConfig[];
  height?: number;
  yDomain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
  rightYDomain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,53,15,0.08)" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: "#78716c" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: "#78716c" }}
          tickLine={false}
          axisLine={false}
          domain={yDomain}
        />
        {hasRight && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: "#78716c" }}
            tickLine={false}
            axisLine={false}
            domain={rightYDomain}
          />
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(120,53,15,0.12)",
            borderRadius: 12,
            fontSize: 12,
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          iconSize={10}
          iconType="circle"
        />
        {lines.map((l) => (
          <Line
            key={l.dataKey}
            type="monotone"
            dataKey={l.dataKey}
            name={l.name ?? l.dataKey}
            stroke={l.color}
            strokeWidth={2}
            yAxisId={l.yAxisId ?? "left"}
            dot={{ r: 2.5, fill: l.color, strokeWidth: 0 }}
            activeDot={{ r: 4.5, strokeWidth: 0 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

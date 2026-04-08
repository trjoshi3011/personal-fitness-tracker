"use client";

import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export function BarChartView({
  data,
  xKey,
  yKey,
  color = "#ea580c",
  yUnit = "",
  height = 220,
  barRadius = 6,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  color?: string;
  yUnit?: string;
  height?: number;
  barRadius?: number;
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: "var(--chart-axis-text)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--chart-axis-text)" }}
          tickLine={false}
          axisLine={false}
          unit={yUnit}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-tooltip-border)",
            borderRadius: 12,
            fontSize: 12,
            color: "var(--chart-tooltip-text)",
          }}
        />
        <Bar
          dataKey={yKey}
          fill={color}
          radius={[barRadius, barRadius, 0, 0]}
          maxBarSize={48}
        />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  ResponsiveContainer,
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export function AreaChartView({
  data,
  xKey,
  yKey,
  color = "#ea580c",
  gradientId,
  yUnit = "",
  height = 220,
  yDomain,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  color?: string;
  gradientId?: string;
  yUnit?: string;
  height?: number;
  yDomain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
}) {
  const id = gradientId ?? `grad-${yKey}`;
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
      <RechartsAreaChart
        data={data}
        margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
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
          domain={yDomain}
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
        <Area
          type="monotone"
          dataKey={yKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 5, strokeWidth: 0 }}
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}

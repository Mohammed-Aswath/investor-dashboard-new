"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DayPoint } from "@/lib/metrics/types";

type Props = {
  title: string;
  subtitle?: string;
  data: DayPoint[];
  color?: string;
  kind?: "area" | "bar";
  valueLabel?: string;
};

function shortDay(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function TrendChart({
  title,
  subtitle,
  data,
  color = "#6B5CF0",
  kind = "area",
  valueLabel = "Value",
}: Props) {
  const gradId = `grad-${title.replace(/[^a-zA-Z0-9]+/g, "-")}`;
  const chartData = data.map((p) => ({
    ...p,
    label: shortDay(p.day),
  }));
  const total = data.reduce((s, p) => s + p.value, 0);
  const peak = data.reduce((m, p) => Math.max(m, p.value), 0);

  return (
    <div className="animate-rise rounded-[28px] border border-line bg-white p-5 shadow-card md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-extrabold tracking-tight text-ink">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 text-xs text-mist">{subtitle}</p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-medium text-ink">{total}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-mist">
            30d total · peak {peak}
          </p>
        </div>
      </div>
      <div className="h-48 w-full">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-mist">
            No series data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {kind === "bar" ? (
              <BarChart data={chartData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#ECEAE7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#4A4742", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#4A4742", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(20,19,15,0.1)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                    fontSize: 12,
                  }}
                  formatter={(v) => [v as number, valueLabel]}
                />
                <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#ECEAE7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#4A4742", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#4A4742", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(20,19,15,0.1)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                    fontSize: 12,
                  }}
                  formatter={(v) => [v as number, valueLabel]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2.4}
                  fill={`url(#${gradId})`}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ComparePoint = {
  name: string;
  value: number;
  /** Optional color override */
  color?: string;
};

type Props = {
  title: string;
  subtitle?: string;
  footnote?: string;
  data: ComparePoint[];
  valueLabel?: string;
};

const DEFAULT_COLORS = ["#2F6F4E", "#C45C26", "#E85476", "#6B5CF0", "#4A4742"];

export function CompareChart({
  title,
  subtitle,
  footnote,
  data,
  valueLabel = "Count",
}: Props) {
  const total = data.reduce((s, p) => s + p.value, 0);

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
            total shown
          </p>
        </div>
      </div>
      <div className="h-52 w-full">
        {data.length === 0 || total === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-mist">
            No data for this chart yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: -8, bottom: 8 }}
            >
              <CartesianGrid stroke="#ECEAE7" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "#4A4742", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={0}
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
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {footnote ? (
        <p className="mt-3 text-xs leading-relaxed text-mist">{footnote}</p>
      ) : null}
    </div>
  );
}

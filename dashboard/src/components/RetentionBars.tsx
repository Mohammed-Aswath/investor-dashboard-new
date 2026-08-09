import type { NullableNumber } from "@/lib/metrics/types";
import { formatPct } from "@/lib/format";

type Row = {
  label: string;
  value: NullableNumber;
  cohort: number;
};

export function RetentionBars({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-5">
      {rows.map((row) => {
        const width = row.value == null ? 0 : Math.min(100, row.value);
        return (
          <div key={row.label}>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <span className="font-sans text-sm text-parchment-muted">
                {row.label}
              </span>
              <span className="font-display text-xl text-parchment">
                {formatPct(row.value)}
                <span className="ml-2 font-sans text-xs text-parchment-dim">
                  n={row.cohort}
                </span>
              </span>
            </div>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-ink-line">
              <div
                className="h-full rounded-full bg-brass transition-all duration-700"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

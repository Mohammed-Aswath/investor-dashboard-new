type Props = {
  label: string;
  value: string;
  hint?: string;
  large?: boolean;
  delayMs?: number;
};

export function MetricTile({
  label,
  value,
  hint,
  large = false,
  delayMs = 0,
}: Props) {
  return (
    <div
      className="animate-rise rounded-2xl border border-ink-line/80 bg-ink-elev/80 px-5 py-5"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-parchment-dim">
        {label}
      </p>
      <p
        className={
          large
            ? "mt-3 font-display text-5xl tracking-tight text-parchment md:text-6xl"
            : "mt-2 font-display text-3xl tracking-tight text-parchment"
        }
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-2 font-sans text-xs leading-relaxed text-parchment-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

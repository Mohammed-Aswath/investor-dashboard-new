type Props = {
  /** Big plain title — readable in 1 second */
  title: string;
  /** Tiny supporting line under the title */
  subtitle: string;
  value: number | null;
  /** Optional real count under the ring, e.g. "15 of 100 students" */
  countLine?: string;
  size?: number;
  tone?: "violet" | "good" | "warn" | "ink";
};

const tones = {
  violet: "#6B5CF0",
  good: "#2A9D6B",
  warn: "#E8A430",
  ink: "#14130F",
};

export function ScoreRing({
  title,
  subtitle,
  value,
  countLine,
  size = 132,
  tone = "violet",
}: Props) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const offset = c - (pct / 100) * c;
  const color = tones[tone];

  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-[15px] font-extrabold tracking-tight text-ink">
        {title}
      </p>
      <p className="mt-0.5 text-[12px] font-medium text-mist">{subtitle}</p>
      <div className="relative mt-4" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#ECEAE7"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[1.7rem] font-medium tracking-tight text-ink">
            {value == null ? "—" : `${Math.round(value)}%`}
          </span>
        </div>
      </div>
      {countLine ? (
        <p className="mt-3 max-w-[12rem] text-[12px] font-medium leading-snug text-mist">
          {countLine}
        </p>
      ) : null}
    </div>
  );
}

import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function Section({ eyebrow, title, subtitle, children }: Props) {
  return (
    <section className="animate-rise border-t border-ink-line/70 pt-12">
      <div className="mb-8 max-w-2xl">
        <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-brass">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-display text-3xl text-parchment md:text-4xl">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-3 font-sans text-sm leading-relaxed text-parchment-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

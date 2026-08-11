"use client";

import { useState, type FormEvent } from "react";

const EXAMPLES = [
  "What is the biggest blocker before we can prove Prism works?",
  "Why are real study minutes so low if 44 timers finished?",
  "What should engineering fix first this week?",
];

export function AskBox() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setAnswer(null);
    setMeta(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = (await res.json()) as {
        answer?: string;
        model?: string;
        asOf?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Ask failed");
        return;
      }
      setAnswer(json.answer ?? "");
      setMeta(
        json.model && json.asOf
          ? `Answered with ${json.model} · using live snapshot ${new Date(json.asOf).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`
          : null,
      );
    } catch {
      setError("Network error talking to /api/ask");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[22px] border border-line bg-white/95 px-5 py-5 shadow-card">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mist">
        Ask about this live data
      </p>
      <h2 className="mt-2 text-lg font-bold text-ink">
        Type a question — Gemini answers with full Proof Desk context
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-mist">
        Your question is sent with the current Setup checklist, Study results,
        and Research questions from the database. Add{" "}
        <code className="rounded bg-paper px-1.5 py-0.5 text-xs text-ink">
          GEMINI_API_KEY
        </code>{" "}
        in <span className="font-medium text-ink">investor-analytics/.env</span>{" "}
        and restart the server once.
      </p>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          placeholder="Example: What exactly is broken in our study-minute logging, and what should we do first?"
          className="w-full resize-y rounded-2xl border border-line bg-paper px-4 py-3 text-sm text-ink outline-none transition focus:border-violet"
          required
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuestion(ex)}
              className="rounded-full border border-line bg-paper px-3 py-1.5 text-left text-[11px] font-medium text-mist hover:text-ink"
            >
              {ex}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={pending || question.trim().length < 3}
          className="rounded-full bg-ink px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white disabled:opacity-50"
        >
          {pending ? "Thinking with live context…" : "Ask Gemini"}
        </button>
      </form>

      {error ? (
        <p className="mt-4 rounded-2xl border border-[#E85476]/30 bg-[#E85476]/10 px-4 py-3 text-sm text-[#E85476]">
          {error}
        </p>
      ) : null}

      {answer ? (
        <div className="mt-4 rounded-2xl border border-line bg-paper/80 px-4 py-4">
          {meta ? (
            <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-mist">
              {meta}
            </p>
          ) : null}
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
            {answer}
          </div>
        </div>
      ) : null}
    </section>
  );
}

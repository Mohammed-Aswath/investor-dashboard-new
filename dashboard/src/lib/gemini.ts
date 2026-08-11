import { getGeminiApiKey } from "./env";
import type { MetricsPayload } from "./metrics/types";

const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest";

function buildContext(metrics: MetricsPayload): string {
  const readiness = metrics.readiness.checks
    .map(
      (c) =>
        `P${c.priority}. [${c.status.toUpperCase()}] ${c.label}
   Root cause: ${c.rootCause}
   Proof: ${c.proof}
   Fix: ${c.fix}`,
    )
    .join("\n\n");

  const hyps = metrics.hypotheses
    .map(
      (h) =>
        `${h.id} (${h.status}): ${h.claim}
   Detail: ${h.detail}
   Evidence: ${JSON.stringify(h.evidence)}`,
    )
    .join("\n\n");

  const o = metrics.outcomes;

  return `You are helping the Aqademiq team understand Prism Proof Desk.
Prism is the focus-sound engine inside the Aqademiq study app.
This tool is NOT an investor dashboard. Be honest. Do not invent causal "Prism works" claims when readiness is red or samples are tiny.
Use simple everyday language. Structure answers with short headings when helpful.
If the user asks what to do next, prioritize fixing trustworthy study minutes and session end times first.

LIVE DATA SNAPSHOT (as of ${metrics.meta.asOf}, last ${metrics.meta.windowDays} days):

## Setup checklist summary
Ready: ${metrics.readiness.summary.green}, Partial: ${metrics.readiness.summary.amber}, Missing: ${metrics.readiness.summary.red}

## Setup checklist detail
${readiness}

## Study results
- Sessions started: ${o.sessionsStarted}
- Sessions completed: ${o.sessionsCompleted}
- Timer finish rate: ${o.timerFinishRate ?? "N/A"}%
- Valid EFM sessions: ${o.validEfmSessions}
- Total real study minutes (EFM): ${o.totalEfm}
- Mean EFM per valid session: ${o.meanEfmPerValidSession ?? "N/A"}
- Productive study days (PAD): ${o.padCount} (users: ${o.padUsers})
- Prism on sessions: ${o.prismOnSessions}, off: ${o.prismOffSessions}
- Valid EFM Prism on/off: ${o.prismOnValidEfm} / ${o.prismOffValidEfm}
- Mean EFM Prism on/off: ${o.meanEfmPrismOn ?? "N/A"} / ${o.meanEfmPrismOff ?? "N/A"}
- Started for real (VAS): ${o.vasReached}/${o.vasEligible} (${o.vasRate ?? "N/A"}%)
- ended_at filled: ${o.endedAtFilledPct ?? "N/A"}%
- prism_preset coverage: ${o.prismPresetCoveragePct ?? "N/A"}%
- Instrumentation note: ${o.instrumentationNote}

## Research questions
${hyps}
`;
}

export async function askGeminiAboutMetrics(
  question: string,
  metrics: MetricsPayload,
): Promise<{ answer: string; model: string }> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to investor-analytics/.env and restart the server.",
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${buildContext(metrics)}\n\nUSER QUESTION:\n${question.trim()}\n\nAnswer using only the live data and checklist above. If something is unknown from the snapshot, say so.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    }),
  });

  const json = (await res.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  if (!res.ok) {
    throw new Error(json.error?.message ?? `Gemini API error (${res.status})`);
  }

  const answer =
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!answer) {
    throw new Error("Gemini returned an empty answer. Try again.");
  }

  return { answer, model: MODEL };
}

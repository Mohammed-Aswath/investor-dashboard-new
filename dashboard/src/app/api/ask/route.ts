import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getDatabaseUrl, getGeminiApiKey } from "@/lib/env";
import { askGeminiAboutMetrics } from "@/lib/gemini";
import { fetchMetrics } from "@/lib/metrics/fetch";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getGeminiApiKey()) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is missing. Add it to investor-analytics/.env, then restart npm run dev.",
      },
      { status: 503 },
    );
  }

  if (!getDatabaseUrl()) {
    return NextResponse.json(
      { error: "DATABASE_URL is not set — cannot load live context." },
      { status: 503 },
    );
  }

  let question = "";
  try {
    const body = (await request.json()) as { question?: string };
    question = (body.question ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (question.length < 3) {
    return NextResponse.json(
      { error: "Type a question (at least a few words)." },
      { status: 400 },
    );
  }

  if (question.length > 2000) {
    return NextResponse.json(
      { error: "Question is too long (max 2000 characters)." },
      { status: 400 },
    );
  }

  try {
    const metrics = await fetchMetrics();
    if (metrics.meta.error) {
      return NextResponse.json(
        { error: `Could not load metrics: ${metrics.meta.error}` },
        { status: 503 },
      );
    }
    const { answer, model } = await askGeminiAboutMetrics(question, metrics);
    return NextResponse.json({
      answer,
      model,
      asOf: metrics.meta.asOf,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ask failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

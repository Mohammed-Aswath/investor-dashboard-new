import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getDatabaseUrl } from "@/lib/env";
import { fetchMetrics } from "@/lib/metrics/fetch";
import { emptyMetrics } from "@/lib/metrics/types";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getDatabaseUrl()) {
    return NextResponse.json(
      emptyMetrics(
        "DATABASE_URL is not set in investor-analytics/.env. No metrics invented.",
      ),
      { status: 503 },
    );
  }

  try {
    const metrics = await fetchMetrics();
    return NextResponse.json(metrics);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Database query failed";
    return NextResponse.json(emptyMetrics(message), { status: 503 });
  }
}

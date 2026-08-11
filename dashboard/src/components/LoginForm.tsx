"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "./BrandMark";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Login failed");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <div className="animate-rise w-full max-w-md rounded-[32px] border border-line bg-white/90 p-8 shadow-lift backdrop-blur">
        <BrandMark size={44} />
        <h1 className="mt-6 font-display text-4xl tracking-tight text-ink">
          Prism Proof Desk
        </h1>
        <p className="mt-3 text-sm font-medium leading-relaxed text-mist">
          Internal tool for the Aqademiq team. It shows whether we can prove
          Prism helps students study, what study behavior we see in the live
          database, and which research questions are still blocked. Not an
          investor dashboard.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-mist">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-line bg-paper px-4 py-3.5 text-ink outline-none transition focus:border-violet"
              required
            />
          </label>

          {error ? <p className="text-sm font-medium text-[#E85476]">{error}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-ink px-4 py-3.5 text-sm font-extrabold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Checking…" : "Open Prism Proof Desk"}
          </button>
        </form>
      </div>
    </div>
  );
}

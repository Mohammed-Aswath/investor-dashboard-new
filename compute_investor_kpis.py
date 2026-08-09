#!/usr/bin/env python3
"""Compute investor KPIs from verified inputs only. Never invents missing values."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Optional


def pct(numer: Optional[float], denom: Optional[float]) -> Optional[float]:
    if numer is None or denom is None:
        return None
    if denom == 0:
        return None
    return round(100.0 * float(numer) / float(denom), 2)


def ratio(numer: Optional[float], denom: Optional[float]) -> Optional[float]:
    if numer is None or denom is None:
        return None
    if denom == 0:
        return None
    return round(float(numer) / float(denom), 4)


def per_user(total: Optional[float], users: Optional[float]) -> Optional[float]:
    return ratio(total, users)


def fmt(v: Any) -> str:
    if v is None:
        return "N/A — missing input (not calculated)"
    if isinstance(v, float):
        return f"{v}"
    return str(v)


def fmt_pct(v: Optional[float]) -> str:
    if v is None:
        return "N/A — missing input (not calculated)"
    return f"{v}%"


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python3 compute_investor_kpis.py inputs.json", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}", file=sys.stderr)
        return 2

    data = json.loads(path.read_text())
    c = data.get("counts") or {}

    # Required for an honest status line
    filled = sum(1 for v in c.values() if v is not None)
    total_keys = len(c)

    registered = c.get("registered_users")
    guests = c.get("guest_users")
    wau = c.get("wau")
    mau = c.get("mau")
    dau = c.get("dau")

    report = {
        "meta": {
            "as_of_date": data.get("as_of_date"),
            "window_days": data.get("window_days"),
            "source": data.get("source"),
            "inputs_filled": f"{filled}/{total_keys}",
            "rule": "Any metric with a missing input is N/A. No estimates.",
        },
        "growth": {
            "registered_users": registered,
            "guest_users": guests,
            "onboarded_users": c.get("onboarded_users"),
            "onboarding_rate": pct(c.get("onboarded_users"), registered),
            "signups_in_window": c.get("signups_in_window"),
            "guests_in_window": c.get("guests_in_window"),
            "referred_signups_in_window": c.get("referred_signups_in_window"),
            "referral_share_of_signups": pct(
                c.get("referred_signups_in_window"), c.get("signups_in_window")
            ),
        },
        "activity": {
            "dau": dau,
            "wau": wau,
            "mau": mau,
            "stickiness_dau_mau": pct(dau, mau),
            "stickiness_wau_mau": pct(wau, mau),
        },
        "retention": {
            "d1_retention": pct(c.get("retained_d1"), c.get("cohort_size_d1")),
            "d1_cohort_size": c.get("cohort_size_d1"),
            "d7_retention": pct(c.get("retained_d7"), c.get("cohort_size_d7")),
            "d7_cohort_size": c.get("cohort_size_d7"),
            "d30_retention": pct(c.get("retained_d30"), c.get("cohort_size_d30")),
            "d30_cohort_size": c.get("cohort_size_d30"),
            "formulas": {
                "D1": "retained_d1 / cohort_size_d1 * 100",
                "D7": "retained_d7 / cohort_size_d7 * 100",
                "D30": "retained_d30 / cohort_size_d30 * 100",
            },
        },
        "activation": {
            "first_focus_24h_rate": pct(
                c.get("activated_first_focus_24h"), c.get("new_registered_in_window")
            ),
            "formula": "activated_first_focus_24h / new_registered_in_window * 100",
            "guest_convert_after_focus_rate": pct(
                c.get("guests_converted_after_focus"), c.get("guests_completed_focus")
            ),
            "formula_guest": "guests_converted_after_focus / guests_completed_focus * 100",
        },
        "engagement": {
            "focus_completion_rate": pct(
                c.get("focus_sessions_completed"), c.get("focus_sessions_started")
            ),
            "focus_minutes_per_wau": per_user(c.get("focus_minutes_total"), wau),
            "tasks_completed_per_wau": per_user(c.get("tasks_completed"), wau),
            "ada_messages_per_wau": per_user(c.get("ada_user_messages"), wau),
            "ada_plan_apply_rate": pct(
                c.get("ada_plan_items_applied"), c.get("ada_plan_items_suggested")
            ),
            "formulas": {
                "focus_completion_rate": "focus_sessions_completed / focus_sessions_started * 100",
                "focus_minutes_per_wau": "focus_minutes_total / wau",
                "ada_plan_apply_rate": "ada_plan_items_applied / ada_plan_items_suggested * 100",
            },
        },
        "distribution": {
            "app_store_downloads": c.get("app_store_downloads"),
            "play_store_downloads": c.get("play_store_downloads"),
            "total_store_downloads": (
                (c.get("app_store_downloads") or 0) + (c.get("play_store_downloads") or 0)
                if c.get("app_store_downloads") is not None
                or c.get("play_store_downloads") is not None
                else None
            ),
            "app_store_rating": c.get("app_store_rating"),
            "play_store_rating": c.get("play_store_rating"),
        },
        "monetization": {
            "status": "pre-revenue unless mrr_usd / paying_customers provided",
            "pro_interest_signups": c.get("pro_interest_signups"),
            "mrr_usd": c.get("mrr_usd"),
            "paying_customers": c.get("paying_customers"),
            "arpu_usd": ratio(c.get("mrr_usd"), c.get("paying_customers")),
        },
    }

    # Pretty investor-facing text
    lines = []
    lines.append("=" * 72)
    lines.append("AQADEMIQ INVESTOR KPI REPORT (COMPUTED FROM INPUTS ONLY)")
    lines.append("=" * 72)
    lines.append(f"As of: {fmt(report['meta']['as_of_date'])}")
    lines.append(f"Window: {fmt(report['meta']['window_days'])} days")
    lines.append(f"Source: {fmt(report['meta']['source'])}")
    lines.append(f"Inputs filled: {report['meta']['inputs_filled']}")
    lines.append(f"Rule: {report['meta']['rule']}")
    lines.append("")

    if filled == 0:
        lines.append("STATUS: NO VERIFIED INPUTS")
        lines.append(
            "App not released / no production counts provided. "
            "All KPIs are N/A. Fill inputs.json from extract_kpis.sql, then re-run."
        )
        lines.append("")
        lines.append("Website claim '1,000+ students' is NOT used here (unverified in this workspace).")
        print("\n".join(lines))
        out_path = path.with_name("report.last.json")
        out_path.write_text(json.dumps(report, indent=2))
        print(f"\nJSON written to {out_path}")
        return 0

    def section(title: str) -> None:
        lines.append("-" * 72)
        lines.append(title)
        lines.append("-" * 72)

    section("1) GROWTH")
    g = report["growth"]
    lines.append(f"Registered users:     {fmt(g['registered_users'])}")
    lines.append(f"Guest users:          {fmt(g['guest_users'])}")
    lines.append(f"Onboarded users:      {fmt(g['onboarded_users'])}")
    lines.append(f"Onboarding rate:      {fmt_pct(g['onboarding_rate'])}  [= onboarded / registered]")
    lines.append(f"Signups in window:    {fmt(g['signups_in_window'])}")
    lines.append(f"Referral share:       {fmt_pct(g['referral_share_of_signups'])}  [= referred / signups]")

    section("2) ACTIVITY")
    a = report["activity"]
    lines.append(f"DAU:                  {fmt(a['dau'])}")
    lines.append(f"WAU:                  {fmt(a['wau'])}")
    lines.append(f"MAU:                  {fmt(a['mau'])}")
    lines.append(f"DAU/MAU stickiness:   {fmt_pct(a['stickiness_dau_mau'])}")
    lines.append(f"WAU/MAU stickiness:   {fmt_pct(a['stickiness_wau_mau'])}")

    section("3) RETENTION")
    r = report["retention"]
    lines.append(f"D1:  {fmt_pct(r['d1_retention'])}  (cohort n={fmt(r['d1_cohort_size'])})  [= retained_d1 / cohort_size_d1]")
    lines.append(f"D7:  {fmt_pct(r['d7_retention'])}  (cohort n={fmt(r['d7_cohort_size'])})  [= retained_d7 / cohort_size_d7]")
    lines.append(f"D30: {fmt_pct(r['d30_retention'])} (cohort n={fmt(r['d30_cohort_size'])}) [= retained_d30 / cohort_size_d30]")

    section("4) ACTIVATION")
    act = report["activation"]
    lines.append(f"First focus ≤24h:     {fmt_pct(act['first_focus_24h_rate'])}  [{act['formula']}]")
    lines.append(f"Guest convert@focus:  {fmt_pct(act['guest_convert_after_focus_rate'])}  [{act['formula_guest']}]")

    section("5) ENGAGEMENT")
    e = report["engagement"]
    lines.append(f"Focus completion:     {fmt_pct(e['focus_completion_rate'])}")
    lines.append(f"Focus mins / WAU:     {fmt(e['focus_minutes_per_wau'])}")
    lines.append(f"Tasks done / WAU:     {fmt(e['tasks_completed_per_wau'])}")
    lines.append(f"Ada msgs / WAU:       {fmt(e['ada_messages_per_wau'])}")
    lines.append(f"Ada plan apply rate:  {fmt_pct(e['ada_plan_apply_rate'])}")

    section("6) DISTRIBUTION (store consoles — not in DB)")
    d = report["distribution"]
    lines.append(f"iOS downloads:        {fmt(d['app_store_downloads'])}")
    lines.append(f"Android downloads:    {fmt(d['play_store_downloads'])}")
    lines.append(f"App Store rating:     {fmt(d['app_store_rating'])}")
    lines.append(f"Play rating:          {fmt(d['play_store_rating'])}")

    section("7) MONETIZATION")
    m = report["monetization"]
    lines.append(f"Status:               {m['status']}")
    lines.append(f"Pro interest:         {fmt(m['pro_interest_signups'])}")
    lines.append(f"MRR (USD):            {fmt(m['mrr_usd'])}")
    lines.append(f"Paying customers:     {fmt(m['paying_customers'])}")
    lines.append(f"ARPU (USD):           {fmt(m['arpu_usd'])}  [= mrr_usd / paying_customers]")

    lines.append("")
    lines.append("=" * 72)
    print("\n".join(lines))

    out_path = path.with_name("report.last.json")
    out_path.write_text(json.dumps(report, indent=2))
    print(f"JSON written to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

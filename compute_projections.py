#!/usr/bin/env python3
"""
12-month investor projection model.

IMPORTANT:
- Outputs are MODEL RESULTS from assumptions, not measured product KPIs.
- If any required assumption is null, that scenario is skipped (no inventing).
- Label slides as "Projection (assumptions)" until source is measured.
"""

from __future__ import annotations

import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional


REQUIRED = [
    "month0_starting_registered_users",
    "month1_new_signups",
    "monthly_signup_growth_rate",
    "activation_rate_first_focus_24h",
    "d7_retention",
    "d30_retention",
    "month2_plus_retention_of_prior_mau",
    "wau_to_mau_ratio",
    "focus_sessions_per_wau_per_week",
    "focus_completion_rate",
    "avg_focus_minutes",
    "paid_launch_month",
    "free_to_paid_conversion_rate",
    "monthly_price_usd",
    "paid_monthly_churn",
]


def apply_mult(base: Dict[str, Any], mult: Dict[str, float]) -> Dict[str, Any]:
    out = deepcopy(base)
    for k, m in mult.items():
        if out.get(k) is not None:
            out[k] = float(out[k]) * float(m)
    return out


def missing_required(a: Dict[str, Any]) -> List[str]:
    return [k for k in REQUIRED if a.get(k) is None]


def project_scenario(name: str, a: Dict[str, Any], months: int) -> Dict[str, Any]:
    miss = missing_required(a)
    if miss:
        return {
            "scenario": name,
            "status": "blocked",
            "missing_assumptions": miss,
            "months": [],
        }

    g = float(a["monthly_signup_growth_rate"])
    act = float(a["activation_rate_first_focus_24h"])
    d7 = float(a["d7_retention"])
    d30 = float(a["d30_retention"])
    mau_retain = float(a["month2_plus_retention_of_prior_mau"])
    wau_mau = float(a["wau_to_mau_ratio"])
    sessions_per_wau_week = float(a["focus_sessions_per_wau_per_week"])
    completion = float(a["focus_completion_rate"])
    avg_mins = float(a["avg_focus_minutes"])
    paid_m = int(a["paid_launch_month"])
    conv = float(a["free_to_paid_conversion_rate"])
    price = float(a["monthly_price_usd"])
    churn = float(a["paid_monthly_churn"])
    referral_share = float(a.get("referral_share_of_signups") or 0)
    k_factor = float(a.get("viral_k_factor") or 0)
    cac = a.get("cac_usd")
    mkt = float(a.get("monthly_marketing_spend_usd") or 0)

    cumulative = float(a["month0_starting_registered_users"])
    prior_mau = 0.0
    paying = 0.0
    rows: List[Dict[str, Any]] = []

    for m in range(1, months + 1):
        # Organic/planned new signups with MoM growth from month1 base
        organic = float(a["month1_new_signups"]) * ((1.0 + g) ** (m - 1))
        # Simple viral add-on: prior month new users * k_factor
        viral = (rows[-1]["new_signups"] * k_factor) if rows else 0.0
        new_signups = organic + viral
        cumulative += new_signups

        activated = new_signups * act
        # MAU model:
        # - new activated users retained to month (proxy with d30 for mature month,
        #   d7 for early contribution)
        # - prior MAU retained
        new_to_mau = activated * (0.55 * d7 + 0.45 * d30)
        mau = new_to_mau + prior_mau * mau_retain
        wau = mau * wau_mau
        dau = wau * 0.35  # structural proxy; labeled as model proxy below

        focus_started = wau * sessions_per_wau_week * 4.345
        focus_completed = focus_started * completion
        focus_minutes = focus_completed * avg_mins

        # Paid
        new_paid = 0.0
        mrr = 0.0
        if m >= paid_m:
            # convert a slice of MAU each month after paid launch
            new_paid = mau * conv
            paying = paying * (1.0 - churn) + new_paid
            mrr = paying * price

        referred = new_signups * referral_share
        paid_cac_users = (mkt / cac) if (cac and cac > 0) else None

        rows.append(
            {
                "month": m,
                "new_signups": round(new_signups),
                "of_which_referred_model": round(referred),
                "cumulative_registered": round(cumulative),
                "activated_new_users": round(activated),
                "mau": round(mau),
                "wau": round(wau),
                "dau_proxy": round(dau),
                "focus_sessions_completed": round(focus_completed),
                "focus_minutes": round(focus_minutes),
                "paying_customers": round(paying),
                "new_paid": round(new_paid),
                "mrr_usd": round(mrr, 2),
                "arr_usd": round(mrr * 12, 2),
                "implied_paid_users_from_spend": (
                    None if paid_cac_users is None else round(paid_cac_users)
                ),
            }
        )
        prior_mau = mau

    # Formulas shown for investors
    formulas = {
        "new_signups_m": "month1_new_signups * (1 + monthly_signup_growth_rate)^(m-1) + prior_new_signups * viral_k_factor",
        "activated": "new_signups * activation_rate_first_focus_24h",
        "mau": "activated * (0.55*d7 + 0.45*d30) + prior_mau * month2_plus_retention_of_prior_mau",
        "wau": "mau * wau_to_mau_ratio",
        "dau_proxy": "wau * 0.35  (model proxy only, not measured DAU)",
        "focus_completed": "wau * focus_sessions_per_wau_per_week * 4.345 * focus_completion_rate",
        "focus_minutes": "focus_completed * avg_focus_minutes",
        "paying": "prior_paying*(1-paid_monthly_churn) + mau*free_to_paid_conversion_rate  (from paid_launch_month)",
        "mrr": "paying_customers * monthly_price_usd",
        "arr": "mrr * 12",
    }

    m12 = rows[-1] if rows else {}
    return {
        "scenario": name,
        "status": "ok",
        "assumptions_used": {k: a.get(k) for k in REQUIRED + ["referral_share_of_signups", "viral_k_factor", "cac_usd", "monthly_marketing_spend_usd"]},
        "formulas": formulas,
        "months": rows,
        "summary_month_12": {
            "cumulative_registered": m12.get("cumulative_registered"),
            "mau": m12.get("mau"),
            "wau": m12.get("wau"),
            "mrr_usd": m12.get("mrr_usd"),
            "arr_usd": m12.get("arr_usd"),
            "paying_customers": m12.get("paying_customers"),
            "focus_minutes_month": m12.get("focus_minutes"),
        },
    }


def render(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("=" * 78)
    lines.append("AQADEMIQ 12-MONTH PROJECTION MODEL")
    lines.append("LABEL: MODEL / ASSUMPTIONS — NOT MEASURED PRODUCT PERFORMANCE")
    lines.append("=" * 78)
    lines.append(f"As of: {report['meta'].get('as_of_date')}")
    lines.append(f"Source tag: {report['meta'].get('source')}")
    lines.append(f"Horizon: {report['meta'].get('horizon_months')} months")
    lines.append("")
    lines.append(
        "If you show this to investors, say: "
        "'Projection from stated assumptions' — never 'current performance' "
        "unless source=*_measured and assumptions came from extract_kpis.sql."
    )
    lines.append("")

    for sc in report["scenarios"]:
        lines.append("-" * 78)
        lines.append(f"SCENARIO: {sc['scenario'].upper()}  [{sc['status']}]")
        lines.append("-" * 78)
        if sc["status"] != "ok":
            lines.append("Blocked — missing assumptions:")
            for k in sc["missing_assumptions"]:
                lines.append(f"  - {k}")
            lines.append("")
            continue

        lines.append("Formulas:")
        for k, v in sc["formulas"].items():
            lines.append(f"  {k}: {v}")
        lines.append("")
        lines.append(
            f"{'Mo':>3} {'New':>7} {'CumUsers':>9} {'MAU':>7} {'WAU':>7} "
            f"{'FocusMin':>9} {'Paid':>6} {'MRR$':>9} {'ARR$':>10}"
        )
        for r in sc["months"]:
            lines.append(
                f"{r['month']:>3} {r['new_signups']:>7} {r['cumulative_registered']:>9} "
                f"{r['mau']:>7} {r['wau']:>7} {r['focus_minutes']:>9} "
                f"{r['paying_customers']:>6} {r['mrr_usd']:>9.2f} {r['arr_usd']:>10.2f}"
            )
        s = sc["summary_month_12"]
        lines.append("")
        lines.append(
            f"Month-12 snapshot: users={s['cumulative_registered']}, "
            f"MAU={s['mau']}, WAU={s['wau']}, paid={s['paying_customers']}, "
            f"MRR=${s['mrr_usd']}, ARR=${s['arr_usd']}"
        )
        lines.append("")

    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 2:
        print(
            "Usage: python3 compute_projections.py projection_assumptions.json",
            file=sys.stderr,
        )
        return 2

    path = Path(sys.argv[1])
    data = json.loads(path.read_text())
    a0 = data.get("assumptions") or {}
    months = int(data.get("meta", {}).get("horizon_months") or 12)
    mults = data.get("scenario_multipliers") or {
        "base": {
            "monthly_signup_growth_rate": 1.0,
            "d7_retention": 1.0,
            "free_to_paid_conversion_rate": 1.0,
        }
    }

    scenarios = []
    for name, mult in mults.items():
        scenarios.append(project_scenario(name, apply_mult(a0, mult), months))

    report = {
        "meta": data.get("meta") or {},
        "disclaimer": "Projection model outputs. Not actuals unless assumptions are measured.",
        "scenarios": scenarios,
    }

    text = render(report)
    print(text)
    out = path.with_name("projection.report.json")
    out.write_text(json.dumps(report, indent=2))
    print(f"\nJSON written to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

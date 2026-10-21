#!/usr/bin/env python3
"""Pull Harza Group's Meta creative performance from Moby (Mobybots MCP) one
day at a time and write public/data/latest.json for the NVP Bucket Ledger.

    MOBY_API_KEY=... python3 scripts/fetch_moby.py [--days 90]

Per creative per day: spend, clicks, impressions, Moby-attributed revenue /
orders and new-customer revenue / orders (moby model, 7-day click), new and
recurring visitor counts. NVP = new ÷ (new + recurring) visitors.

The window runs through today (America/New_York, the account timezone), so
the latest day is partial until it closes.
"""
import argparse
import json
import os
import pathlib
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo

URL = "https://api.mobybots.com/v2/mcp"
MODEL, WINDOW = "moby", "7_day_click"
ROOT = pathlib.Path(__file__).resolve().parent.parent


def call(tool, args, key, tries=4):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": {"name": tool, "arguments": args}}).encode()
    req = urllib.request.Request(URL, data=body, method="POST", headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream", "User-Agent": "Mozilla/5.0 (harza-nvp-dashboard)"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                raw = r.read().decode()
            msg = next((json.loads(l[6:]) for l in raw.splitlines() if l.startswith("data: ")), None) or json.loads(raw)
            if "error" in msg:
                raise RuntimeError(msg["error"])
            res = msg["result"]
            if res.get("isError"):
                raise RuntimeError(json.dumps(res)[:500])
            sc = res.get("structuredContent")
            if sc is not None:
                return sc.get("result", sc)
            return json.loads(res["content"][0]["text"])
        except (HTTPError, URLError, RuntimeError, TimeoutError) as e:
            if attempt == tries - 1:
                sys.exit(f"Moby {tool} failed: {e}")
            time.sleep(10 * (attempt + 1))


def product_of(name):
    """2nd underscore token of the ad name: 'VID1667V02_GMR_…' -> GMR, '/GMR' -> GMR."""
    parts = re.sub(r"^\(\d{1,2}/\d{1,2}\)\s*", "", name or "").split("_")
    p = re.sub(r"[^A-Za-z]", "", parts[1]) if len(parts) > 1 else ""
    return p.upper() or None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=int(os.environ.get("WINDOW_DAYS", 90)))
    a = ap.parse_args()
    key = os.environ.get("MOBY_API_KEY")
    if not key:
        sys.exit("MOBY_API_KEY is not set")

    end = datetime.now(ZoneInfo("America/New_York")).date()
    days = [(end - timedelta(days=i)).isoformat() for i in range(a.days - 1, -1, -1)]

    def pull(day):
        rows = call("get_creative_performance", {"channel": "meta", "startDate": day, "endDate": day,
                                                 "attributionModel": MODEL, "attributionWindow": WINDOW}, key)
        return day, rows or []

    with ThreadPoolExecutor(max_workers=4) as ex:
        results = dict(ex.map(pull, days))

    creatives = {}
    for i, day in enumerate(days):
        rows = results[day]
        print(f"  {day}: {len(rows)} creatives, ${sum(r.get('spend') or 0 for r in rows):,.0f}")
        for r in rows:
            name = (r.get("name") or "").strip()
            if not name:
                continue
            c = creatives.setdefault(name, {"ad_name": name, "product": product_of(name),
                                            "thumbnail_url": r.get("smallThumbnailUrl"), "dd": []})
            g = lambda k: float(r.get(k) or 0)
            nv, rv = g("newVisitorCount"), g("recurringVisitorCount")
            if g("spend") <= 0 and g("revenue") <= 0 and nv <= 0:
                continue
            # [dayIdx, spend, rev, orders, nc_rev, nc_orders, new_visitors, visitors, impressions, clicks]
            c["dd"].append([i, round(g("spend"), 2), round(g("revenue"), 2), g("orders"),
                            round(g("newCustomerRevenue"), 2), g("newCustomerOrders"), nv, nv + rv,
                            g("impressions"), g("outboundClicks")])

    ads = []
    for c in creatives.values():
        t = [sum(r[j] for r in c["dd"]) for j in range(1, 10)]
        if t[0] <= 0 and t[1] <= 0:
            continue
        c["metrics"] = {"spend": round(t[0], 2), "rev": round(t[1], 2), "nc_rev": round(t[3], 2),
                        "visitors": t[6], "new_visitors": t[5]}
        ads.append(c)
    ads.sort(key=lambda c: -c["metrics"]["spend"])
    if not ads:
        sys.exit("Moby returned no Meta creatives — refusing to publish an empty dashboard")

    spend = sum(c["metrics"]["spend"] for c in ads)
    nc = sum(c["metrics"]["nc_rev"] for c in ads)
    m = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "brand": "Harza Group",
        "source": "moby-mcp:get_creative_performance",
        "attribution": "Moby model, 7-day click",
        "period": {"start": days[0], "end": days[-1]},
        "days": days,
        "baseline": {"ncroas": round(nc / spend, 4) if spend else 0},
        "ads": ads,
    }
    out = ROOT / "public" / "data"
    out.mkdir(parents=True, exist_ok=True)
    (out / "latest.json").write_text(json.dumps(m, separators=(",", ":")))
    nv = sum(c["metrics"]["new_visitors"] for c in ads)
    vis = sum(c["metrics"]["visitors"] for c in ads)
    print(f"{len(ads)} creatives · spend ${spend:,.0f} · NC rev ${nc:,.0f} (NCROAS {nc/spend:.2f}x) · NVP {nv/vis:.1%}")


if __name__ == "__main__":
    main()

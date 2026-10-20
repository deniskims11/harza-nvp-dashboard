# Harza NVP Bucket Ledger

Meta creative spend for Harza Group, bucketed per creative per day/week by
New Visitor % (NVP = new ÷ (new + recurring) visitors), with spend share,
NC ROAS and CPC per bucket.

Data: Moby (Mobybots MCP, `get_creative_performance`, channel `meta`, Moby
model, 7-day click), pulled one day at a time for the last 90 days by
`scripts/fetch_moby.py`. `.github/workflows/deploy-pages.yml` runs it every 4
hours (and on push / manual run) with the `MOBY_API_KEY` repo secret, builds
and publishes to GitHub Pages. No data is committed.

Local: `MOBY_API_KEY=... python3 scripts/fetch_moby.py && npm ci && npm run dev`

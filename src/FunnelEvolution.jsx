import { useMemo } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Funnel Stage Evolution by NVP bucket: one small chart per bucket, last 12
// weeks. Bars = that bucket's weekly spend (same spend axis on all four, so
// sizes compare across buckets), line = its NC ROAS. Each creative's spend in a
// week lands in the bucket of its NVP that week, as in the ledger table below.

const WEEKS = 12;
const MIN_SPEND = 200;
const money = (v) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`);

const mondayOf = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const label = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function FunnelEvolution({ ads, days, buckets, bucketOf }) {
  const { weeks, series, maxSpend, maxRoas } = useMemo(() => {
    const allWeeks = [...new Set(days.map(mondayOf))].sort();
    const weeks = allWeeks.slice(-WEEKS);
    const widx = new Map(weeks.map((w, i) => [w, i]));
    const tot = weeks.map(() => 0);
    const S = Object.fromEntries(buckets.map(b => [b.key, weeks.map(() => ({ spend: 0, nc: 0 }))]));
    for (const a of ads) {
      const own = new Map();
      for (const r of a.dd || []) {
        const i = widx.get(mondayOf(days[r[0]]));
        if (i == null) continue;
        const t = own.get(i) || { spend: 0, nc: 0, nv: 0, vis: 0 };
        t.spend += r[1]; t.nc += r[4]; t.nv += r[6]; t.vis += r[7];
        own.set(i, t);
      }
      for (const [i, t] of own) {
        tot[i] += t.spend;
        if (t.vis > 0) { const c = S[bucketOf((t.nv / t.vis) * 100)][i]; c.spend += t.spend; c.nc += t.nc; }
      }
    }
    let maxSpend = 0, maxRoas = 0;
    const series = {};
    for (const b of buckets) {
      series[b.key] = weeks.map((w, i) => {
        const c = S[b.key][i];
        // Weeks under MIN_SPEND have too little spend for a meaningful ROAS point.
        const roas = c.spend >= MIN_SPEND ? c.nc / c.spend : null;
        maxSpend = Math.max(maxSpend, c.spend);
        if (roas != null) maxRoas = Math.max(maxRoas, roas);
        return { week: label(w), spend: c.spend, ncroas: roas, mix: tot[i] ? (c.spend / tot[i]) * 100 : 0 };
      });
    }
    return { weeks, series, maxSpend, maxRoas };
  }, [ads, days, buckets, bucketOf]);

  if (!weeks.length) return null;
  const spendTop = Math.ceil(maxSpend / 10000) * 10000 || 10000;
  const roasTop = Math.max(1, Math.ceil(maxRoas * 10) / 10);

  const Tip = ({ active, payload, label: wk }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div style={{ background: "#2b2b2b", color: "#fff", borderRadius: 6, padding: "6px 9px", fontSize: 11, lineHeight: 1.5, fontFamily: "ui-monospace, monospace" }}>
        <div style={{ fontWeight: 700 }}>Week of {wk}</div>
        <div><span style={{ color: "#f87171" }}>■</span> NC ROAS {p.ncroas == null ? "—" : `${p.ncroas.toFixed(2)}x`}</div>
        <div><span style={{ color: "#60a5fa" }}>■</span> Spend ${Math.round(p.spend).toLocaleString()}</div>
        <div>mix {p.mix.toFixed(0)}% of weekly spend</div>
      </div>
    );
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #E8DCD0", borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#3a2429" }}>Funnel Stage Evolution by NVP bucket · last {weeks.length} weeks</h3>
      <p style={{ fontSize: 11, color: "#b0978f", margin: "2px 0 12px" }}>
        Bars = ad spend and line = NC ROAS, each on the same axis across all four (no ROAS point for weeks under $200) · hover for the bucket's mix % of that week's spend. Follows the product filter above; the latest week may be partial.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 18 }}>
        {buckets.map(b => (
          <div key={b.key}>
            <div style={{ fontSize: 12, fontWeight: 700, color: b.color, marginBottom: 4 }}>{b.label}</div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={series[b.key]} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1E8E1" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#8a6f68" }} interval={0} angle={-35} textAnchor="end" height={42} />
                <YAxis yAxisId="s" domain={[0, spendTop]} tickFormatter={money} tick={{ fontSize: 10, fill: "#8a6f68" }} width={46} />
                <YAxis yAxisId="r" orientation="right" domain={[0, roasTop]} allowDataOverflow tickFormatter={v => `${v.toFixed(1)}x`} tick={{ fontSize: 10, fill: "#b91c1c" }} width={38} />
                <Tooltip content={<Tip />} />
                <Bar yAxisId="s" dataKey="spend" fill={b.color} radius={[2, 2, 0, 0]} />
                <Line yAxisId="r" dataKey="ncroas" stroke="#c0392b" strokeWidth={2} dot={{ r: 3, fill: "#c0392b" }} connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </div>
  );
}

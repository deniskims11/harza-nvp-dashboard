import { useEffect, useState } from "react";
import NvpLedger from "./NvpLedger.jsx";

export default function App() {
  const [m, setM] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/latest.json`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setM).catch(e => setErr(String(e)));
  }, []);
  return (
    <div style={{ minHeight: "100vh", background: "#FBF7F4", fontFamily: "Inter, system-ui, sans-serif", color: "#3a2429" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 30, fontWeight: 600, margin: 0 }}>Harza NVP Bucket Ledger</h1>
        {m && (
          <p style={{ fontSize: 12, color: "#8a6f68", margin: "6px 0 18px" }}>
            Meta · {m.period.start} → {m.period.end} · {m.ads.length.toLocaleString()} creatives · {m.attribution} ·
            last refreshed {new Date(m.generated_at).toLocaleString()} (updates every 4 hours)
          </p>
        )}
        {err && <p style={{ color: "#b91c1c" }}>Could not load data: {err}</p>}
        {m && <NvpLedger ads={m.ads} days={m.days} baselineNc={m.baseline.ncroas} roasLabel="ROAS"
          visitorNote="new ÷ (new + recurring) visitors (Moby)" />}
      </div>
    </div>
  );
}

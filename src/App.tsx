import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";
import {
  DECAY_PER_SECOND,
  SHOW_THRESHOLD,
  STORAGE_KEYS,
  type SessionMetricPoint,
  type TremorSource,
  clampLoad,
} from "./shared";

const INITIAL_NOW = Date.now();
const DIGITAL_WEIGHT = 0.68;
const TREMOR_WEIGHT = 0.32;

type Snapshot = {
  currentLoadScore?: number;
  physicalTremorScore?: number;
  tremorSource?: TremorSource;
  compositeBurnoutIndex?: number;
  sessionTimeline?: SessionMetricPoint[];
  customAiMessage?: string;
  lastUpdatedAt?: number;
};

function App() {
  const [baseDigitalStress, setBaseDigitalStress] = useState(0);
  const [physicalTremor, setPhysicalTremor] = useState(0);
  const [tremorSource, setTremorSource] = useState<TremorSource>("synthetic");
  const [storedComposite, setStoredComposite] = useState(0);
  const [timeline, setTimeline] = useState<SessionMetricPoint[]>([]);
  const [coachMessage, setCoachMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);
  const [now, setNow] = useState(INITIAL_NOW);
  const [reportState, setReportState] = useState("");
  const [demoWearableEnabled, setDemoWearableEnabled] = useState(false);

  useEffect(() => {
    const applySnapshot = (snapshot: Snapshot) => {
      if (typeof snapshot.currentLoadScore === "number") {
        setBaseDigitalStress(clampLoad(snapshot.currentLoadScore));
      }

      if (typeof snapshot.physicalTremorScore === "number") {
        setPhysicalTremor(clampLoad(snapshot.physicalTremorScore));
      }

      if (
        snapshot.tremorSource === "firebase" ||
        snapshot.tremorSource === "demo" ||
        snapshot.tremorSource === "synthetic"
      ) {
        setTremorSource(snapshot.tremorSource);
      }

      if (typeof snapshot.compositeBurnoutIndex === "number") {
        setStoredComposite(clampLoad(snapshot.compositeBurnoutIndex));
      }

      if (Array.isArray(snapshot.sessionTimeline)) {
        const validPoints = snapshot.sessionTimeline.filter(
          (point): point is SessionMetricPoint =>
            typeof point?.timestamp === "number" &&
            typeof point?.digitalStress === "number" &&
            typeof point?.physicalTremor === "number" &&
            typeof point?.compositeBurnoutIndex === "number",
        );
        setTimeline(validPoints);
      }

      if (typeof snapshot.customAiMessage === "string") {
        setCoachMessage(snapshot.customAiMessage);
      }

      if (typeof snapshot.lastUpdatedAt === "number") {
        setLastUpdatedAt(snapshot.lastUpdatedAt);
      }
    };

    void chrome.storage.local
      .get([
        STORAGE_KEYS.score,
        STORAGE_KEYS.tremorScore,
        STORAGE_KEYS.tremorSource,
        STORAGE_KEYS.compositeBurnoutIndex,
        STORAGE_KEYS.sessionTimeline,
        STORAGE_KEYS.message,
        STORAGE_KEYS.updatedAt,
      ])
      .then((result) => {
        applySnapshot(result);
      });

    const storageListener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area !== "local") return;

      const update: Snapshot = {};

      if (changes[STORAGE_KEYS.score]) {
        update.currentLoadScore = changes[STORAGE_KEYS.score].newValue as number;
      }

      if (changes[STORAGE_KEYS.tremorScore]) {
        update.physicalTremorScore = changes[STORAGE_KEYS.tremorScore].newValue as number;
      }

      if (changes[STORAGE_KEYS.tremorSource]) {
        update.tremorSource = changes[STORAGE_KEYS.tremorSource].newValue as TremorSource;
      }

      if (changes[STORAGE_KEYS.compositeBurnoutIndex]) {
        update.compositeBurnoutIndex = changes[STORAGE_KEYS.compositeBurnoutIndex]
          .newValue as number;
      }

      if (changes[STORAGE_KEYS.sessionTimeline]) {
        update.sessionTimeline = changes[STORAGE_KEYS.sessionTimeline]
          .newValue as SessionMetricPoint[];
      }

      if (changes[STORAGE_KEYS.message]) {
        update.customAiMessage = changes[STORAGE_KEYS.message].newValue as string;
      }

      if (changes[STORAGE_KEYS.updatedAt]) {
        update.lastUpdatedAt = changes[STORAGE_KEYS.updatedAt].newValue as number;
      }

      applySnapshot(update);
    };

    chrome.storage.onChanged.addListener(storageListener);

    const ticker = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
      window.clearInterval(ticker);
    };
  }, []);

  const digitalStress = useMemo(() => {
    if (!lastUpdatedAt) {
      return Math.round(clampLoad(baseDigitalStress));
    }

    const elapsedSeconds = Math.max(0, (now - lastUpdatedAt) / 1000);
    return Math.round(clampLoad(baseDigitalStress - elapsedSeconds * DECAY_PER_SECOND));
  }, [baseDigitalStress, lastUpdatedAt, now]);

  const liveComposite = useMemo(
    () => clampLoad(Math.round(digitalStress * DIGITAL_WEIGHT + physicalTremor * TREMOR_WEIGHT)),
    [digitalStress, physicalTremor],
  );

  const chartData = useMemo(() => {
    const lastPoints = timeline.slice(-60);
    return lastPoints.map((point, index) => ({
      slot: index + 1,
      digital: point.digitalStress,
      tremor: point.physicalTremor,
      composite: point.compositeBurnoutIndex,
    }));
  }, [timeline]);

  useEffect(() => {
    if (!demoWearableEnabled) return;

    let t = 0;
    const timer = window.setInterval(() => {
      t += 0.35;
      const base = digitalStress * 0.55;
      const variability = Math.sin(t) * 12 + Math.sin(t * 0.45) * 6;
      const nextDemoTremor = clampLoad(Math.round(base + 24 + variability));

      chrome.runtime.sendMessage({
        type: "SET_DEMO_TREMOR",
        value: nextDemoTremor,
      });
    }, 1300);

    return () => {
      window.clearInterval(timer);
    };
  }, [demoWearableEnabled, digitalStress]);

  const status =
    liveComposite >= 85
      ? { label: "Critical", className: "critical", note: "Immediate intervention window" }
      : liveComposite >= 65
        ? { label: "Elevated", className: "elevated", note: "Burnout risk accumulating" }
        : liveComposite >= 40
          ? { label: "Watch", className: "watch", note: "Load trending upward" }
          : { label: "Stable", className: "stable", note: "Resilient cognitive baseline" };

  const burnoutForecast = useMemo(() => {
    if (chartData.length < 8) {
      return "Forecast calibrating...";
    }

    const recent = chartData.slice(-18);
    const first = recent[0]?.composite ?? liveComposite;
    const last = recent[recent.length - 1]?.composite ?? liveComposite;
    const slopePerSample = (last - first) / Math.max(1, recent.length - 1);

    if (slopePerSample <= 0) {
      return "Composite trend is stable/downward.";
    }

    const toCritical = SHOW_THRESHOLD - last;
    if (toCritical <= 0) {
      return "Critical range reached. Intervention active.";
    }

    const secondsToCritical = toCritical / slopePerSample;
    const minutes = secondsToCritical / 60;

    if (minutes <= 1) {
      return "Projected critical threshold in <1 minute.";
    }

    if (minutes > 120) {
      return "Projected critical threshold in >2 hours.";
    }

    return `Projected critical threshold in ${minutes.toFixed(1)} minutes.`;
  }, [chartData, liveComposite]);

  const protocolHint =
    physicalTremor > digitalStress
      ? "Somatic load dominates. Prioritize breath + hydration reset."
      : "Cognitive load dominates. Reduce context switching for 10 minutes.";

  const handleGenerateReport = () => {
    console.log("Exporting PDF for neurologist...");
    setReportState("Exporting PDF for neurologist...");

    window.setTimeout(() => {
      setReportState("30-day clinician report queued.");
    }, 1100);
  };

  return (
    <div className={`command-center ${status.className}`}>
      <div className="gradient-orb orb-a" />
      <div className="gradient-orb orb-b" />

      <header className="topbar glass">
        <div>
          <p className="eyebrow">Cognitive Load Meter</p>
          <h1>Burnout Command Center</h1>
        </div>
        <div className="status-chip">{status.label}</div>
      </header>

      <section className="kpi-grid">
        <article className="kpi-card glass">
          <p className="kpi-label">Digital Stress</p>
          <p className="kpi-value">{digitalStress}</p>
        </article>
        <article className="kpi-card glass">
          <p className="kpi-label">Physical Tremor</p>
          <p className="kpi-value">{physicalTremor}</p>
        </article>
        <article className="kpi-card glass">
          <p className="kpi-label">Composite Burnout Index</p>
          <p className="kpi-value">{liveComposite}</p>
        </article>
      </section>

      <section className="glass chart-card">
        <div className="panel-head">
          <h2>Digital vs Physical Signal Stream</h2>
          <p>{status.note}</p>
        </div>

        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={210}>
            <ComposedChart data={chartData}>
              <CartesianGrid stroke="rgba(167, 208, 255, 0.14)" vertical={false} />
              <XAxis dataKey="slot" tick={{ fill: "#c9dff7", fontSize: 11 }} axisLine={false} />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#c9dff7", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(10, 20, 34, 0.95)",
                  border: "1px solid rgba(150, 194, 236, 0.28)",
                  borderRadius: "10px",
                  color: "#e4f0ff",
                }}
              />
              <Legend wrapperStyle={{ color: "#d0e6ff", fontSize: "12px" }} />
              <Bar dataKey="digital" name="Digital Stress" fill="#57c8ff" radius={[4, 4, 0, 0]} />
              <Bar
                dataKey="tremor"
                name="Physical Tremor"
                fill="#8ef0c3"
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="composite"
                name="Composite Burnout Index"
                stroke="#ffb36b"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="glass insight-card">
        <p className="insight-title">Clinical Signal Insight</p>
        <p>
          Composite trend anchor: <strong>{storedComposite}</strong>.{" "}
          {coachMessage.trim() || "Awaiting next intervention note from the coach model."}
        </p>
        <p className="insight-subline">{burnoutForecast}</p>
        <p className="insight-subline">{protocolHint}</p>
        <p className="insight-subline">Tremor Source: {tremorSource}</p>
      </section>

      <div className="actions">
        <button
          className={`secondary-btn ${demoWearableEnabled ? "is-active" : ""}`}
          onClick={() => {
            setDemoWearableEnabled((prev) => !prev);
          }}
          type="button"
        >
          {demoWearableEnabled ? "Disable Wearable Demo Mode" : "Enable Wearable Demo Mode"}
        </button>
        <button
          className="primary-btn"
          onClick={handleGenerateReport}
          type="button"
        >
          Generate 30-Day Clinician Report
        </button>
        <button
          className="secondary-btn"
          onClick={() => {
            chrome.runtime.sendMessage({ type: "RESET_LOAD" });
          }}
          type="button"
        >
          Reset Session
        </button>
      </div>

      {reportState ? <p className="report-state">{reportState}</p> : null}
    </div>
  );
}

export default App;

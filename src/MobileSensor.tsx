import { useEffect, useMemo, useRef, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import { type Database, getDatabase, ref, set } from "firebase/database";
import "./MobileSensor.css";
import { clampLoad } from "./shared";

const FIREBASE_TREMOR_PATH = "cognitive-load-meter/live-tremor";
const PUSH_INTERVAL_MS = 1000;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.databaseURL,
  firebaseConfig.projectId,
  firebaseConfig.appId,
].every((value) => typeof value === "string" && value.length > 0);

type MotionPermissionState = "unknown" | "granted" | "denied";

type DeviceMotionWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const getDatabaseClient = (): Database | null => {
  if (!hasFirebaseConfig) return null;

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getDatabase(app);
};

const getPersistentDeviceId = () => {
  const existing = localStorage.getItem("clm-bridge-device-id");
  if (existing) return existing;

  const deviceId = `bridge-${crypto.randomUUID().slice(0, 8)}`;
  localStorage.setItem("clm-bridge-device-id", deviceId);
  return deviceId;
};

function MobileSensor() {
  const [permission, setPermission] = useState<MotionPermissionState>("unknown");
  const [isStreaming, setIsStreaming] = useState(false);
  const [tremorScore, setTremorScore] = useState(0);
  const [bridgeState, setBridgeState] = useState("Bridge idle");
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const listenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const lastMagnitudeRef = useRef<number | null>(null);
  const motionWindowRef = useRef<number[]>([]);
  const tremorRef = useRef(0);
  const dbClient = useMemo(() => getDatabaseClient(), []);
  const deviceId = useMemo(() => getPersistentDeviceId(), []);

  useEffect(() => {
    tremorRef.current = tremorScore;
  }, [tremorScore]);

  useEffect(() => {
    return () => {
      if (!listenerRef.current) return;
      window.removeEventListener("devicemotion", listenerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isStreaming || !dbClient) return;

    const pushTremor = () => {
      const payload = {
        score: tremorRef.current,
        timestamp: Date.now(),
        deviceId,
      };

      void set(ref(dbClient, FIREBASE_TREMOR_PATH), payload)
        .then(() => {
          setBridgeState("Bridge synced");
          setLastSyncAt(Date.now());
        })
        .catch(() => {
          setBridgeState("Bridge sync failed");
        });
    };

    pushTremor();

    const timer = window.setInterval(pushTremor, PUSH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [dbClient, deviceId, isStreaming]);

  const startSensorStream = () => {
    if (listenerRef.current) return;

    const onMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity ?? event.acceleration;
      if (!acceleration) return;

      const x = acceleration.x ?? 0;
      const y = acceleration.y ?? 0;
      const z = acceleration.z ?? 0;
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      if (lastMagnitudeRef.current !== null) {
        const delta = Math.abs(magnitude - lastMagnitudeRef.current);
        motionWindowRef.current.push(delta);

        if (motionWindowRef.current.length > 45) {
          motionWindowRef.current.shift();
        }

        const avgDelta =
          motionWindowRef.current.reduce((sum, value) => sum + value, 0) /
          Math.max(1, motionWindowRef.current.length);

        const normalizedScore = clampLoad(Math.round(avgDelta * 26));
        setTremorScore(normalizedScore);
      }

      lastMagnitudeRef.current = magnitude;
    };

    listenerRef.current = onMotion;
    window.addEventListener("devicemotion", onMotion, { passive: true });
    setIsStreaming(true);
  };

  const requestSensorPermission = async () => {
    if (typeof window.DeviceMotionEvent === "undefined") {
      setBridgeState("Device motion not supported on this browser.");
      setPermission("denied");
      return;
    }

    const motionCtor = DeviceMotionEvent as DeviceMotionWithPermission;

    if (typeof motionCtor.requestPermission === "function") {
      const result = await motionCtor.requestPermission();
      if (result !== "granted") {
        setPermission("denied");
        setBridgeState("Motion permission denied.");
        return;
      }
    }

    setPermission("granted");
    startSensorStream();
  };

  const ringDegrees = Math.max(6, tremorScore * 3.6);

  const tremorBand =
    tremorScore >= 70
      ? "High micro-tremor activation"
      : tremorScore >= 40
        ? "Moderate hand instability"
        : "Steady motor baseline";

  return (
    <main className="mobile-bridge">
      <div className="mobile-shell">
        <p className="mobile-kicker">Cognitive Load Meter</p>
        <h1>Biometric Bridge</h1>

        <div
          className="ring-wrap"
          style={{
            background: `conic-gradient(#53d2ff ${ringDegrees}deg, rgba(255,255,255,0.08) ${ringDegrees}deg)`,
          }}
        >
          <div className="ring-core">
            <p className="ring-score">{tremorScore}</p>
            <p className="ring-label">Tremor Score</p>
            <div className="heart-pulse">♥</div>
          </div>
        </div>

        <p className="band-label">{tremorBand}</p>

        <div className="mobile-meta">
          <p>Permission: {permission}</p>
          <p>Bridge: {hasFirebaseConfig ? bridgeState : "Firebase config missing"}</p>
          <p>
            Last Sync:{" "}
            {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : "No samples uploaded yet"}
          </p>
        </div>

        <button
          className="mobile-button"
          onClick={() => {
            void requestSensorPermission();
          }}
          type="button"
        >
          {isStreaming ? "Streaming Active" : "Start Tremor Sensor"}
        </button>

        <p className="mobile-tip">
          Open this page on your phone with <code>?mode=mobile</code> while the extension runs in
          Chrome.
        </p>
      </div>
    </main>
  );
}

export default MobileSensor;

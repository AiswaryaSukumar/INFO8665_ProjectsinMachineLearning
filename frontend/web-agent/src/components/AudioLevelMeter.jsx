// src/components/AudioLevelMeter.jsx
import { useEffect, useRef, useState } from "react";

/**
 * Simple mic level meter (Option A):
 * - requests mic permission when `active` becomes true
 * - shows animated bars based on real-time audio level
 * - drops to near zero when muted/silent
 */
export default function AudioLevelMeter({ active }) {
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0); // 0..1
  const rafRef = useRef(null);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const dataRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setError("");
      setLevel(0);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          // if effect cleaned up while permission dialog was open
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;

        source.connect(analyser);

        const bufferLength = analyser.fftSize;
        dataRef.current = new Uint8Array(bufferLength);

        const tick = () => {
          const analyserNode = analyserRef.current;
          const data = dataRef.current;

          if (!analyserNode || !data) return;

          analyserNode.getByteTimeDomainData(data);

          // Compute RMS from time-domain data
          let sumSq = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128; // -1..1
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / data.length); // 0..~1

          // Smooth a bit so it looks nice
          setLevel((prev) => prev * 0.7 + rms * 0.3);

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        setError("Microphone access blocked. Allow mic permission to see live input.");
      }
    }

    function stop() {
      setLevel(0);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      if (audioCtxRef.current) {
        // close audio context
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
      analyserRef.current = null;
      dataRef.current = null;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
    }

    if (active) start();
    else stop();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active]);

  // 8 bars, scaled from level
  const bars = 8;
  const scaled = Math.min(1, Math.max(0, level * 3)); // boost a bit so normal speech shows well

  return (
    <div style={{ marginTop: 10 }}>
      <label>Live Audio Level</label>

      {error ? (
        <div className="errorBanner" style={{ marginTop: 8 }}>
          <div className="errorBannerText">{error}</div>
        </div>
      ) : (
        <>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 6,
              alignItems: "flex-end",
              height: 28,
            }}
            aria-label="Audio level meter"
          >
            {Array.from({ length: bars }).map((_, i) => {
              const t = (i + 1) / bars; // 0..1
              const on = scaled >= t;
              const h = 6 + i * 3; // increasing heights
              return (
                <div
                  key={i}
                  style={{
                    width: 10,
                    height: h,
                    borderRadius: 999,
                    background: on ? "linear-gradient(90deg, var(--brand1), var(--brand2))" : "#e5e7eb",
                    transition: "background 120ms ease",
                  }}
                />
              );
            })}
          </div>

          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
            If the mic is muted or there’s no input, the bars will drop to zero.
          </div>
        </>
      )}
    </div>
  );
}

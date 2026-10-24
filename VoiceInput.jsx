import { useState, useRef, useEffect, useCallback } from "react";

/* ---------- 1. Hook ---------- */
export function useVoiceInput({ lang = "ta-IN", onResult, onInterim }) {
  const SR =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const supported = !!SR;
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    try { recRef.current && recRef.current.stop(); } catch (e) {}
  }, []);

  const start = useCallback(() => {
    if (!supported) return;
    setError("");
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      const map = {
        "not-allowed": "Microphone permission denied",
        "service-not-allowed": "Microphone permission denied",
        "no-speech": "No speech heard, try again",
        "network": "Voice needs an internet connection",
        "audio-capture": "No microphone found",
      };
      setError(map[e.error] || "Voice input failed");
    };
    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      if (interim && onInterim) onInterim(interim.trim());
      if (finalText && onResult) onResult(finalText.trim());
    };

    recRef.current = rec;
    try { rec.start(); } catch (e) { setError("Could not start microphone"); }
  }, [SR, supported, lang, onResult, onInterim]);

  useEffect(() => () => stop(), [stop]);

  return { supported, listening, error, start, stop };
}

/* ---------- 2. Mic button with Tamil/English toggle ---------- */
export function VoiceButton({ onResult, onInterim, defaultLang = "ta-IN", size = 40 }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("voiceLang") || defaultLang; }
    catch (e) { return defaultLang; }
  });

  const { supported, listening, error, start, stop } = useVoiceInput({
    lang, onResult, onInterim,
  });

  const toggleLang = () => {
    const next = lang === "ta-IN" ? "en-IN" : "ta-IN";
    setLang(next);
    try { localStorage.setItem("voiceLang", next); } catch (e) {}
  };

  if (!supported) return null; // hide on browsers without support

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-label={listening ? "Stop voice input" : "Start voice input"}
        aria-pressed={listening}
        style={{
          width: size, height: size, borderRadius: "50%",
          border: "1px solid #bbb",
          background: listening ? "#d32f2f" : "#fff",
          color: listening ? "#fff" : "#333",
          fontSize: size * 0.5, cursor: "pointer", lineHeight: 1,
        }}
      >
        🎤
      </button>
      <button
        type="button"
        onClick={toggleLang}
        aria-label="Switch voice language"
        style={{
          border: "1px solid #bbb", borderRadius: 6, background: "#fff",
          padding: "4px 8px", fontSize: 13, cursor: "pointer",
        }}
      >
        {lang === "ta-IN" ? "தமிழ்" : "EN"}
      </button>
      {listening && <small>Listening…</small>}
      {error && <small style={{ color: "#d32f2f" }}>{error}</small>}
    </span>
  );
}

/* ---------- 3. Loose matching of spoken text to products ---------- */
const norm = (s) =>
  (s || "").toString().toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// getNames(product) -> array of strings, e.g. [p.name, p.nameTa]
export function matchProducts(transcript, products, getNames) {
  const q = norm(transcript);
  if (!q) return products;
  const words = q.split(" ").filter(Boolean);

  const scored = products.map((p) => {
    const names = getNames(p).map(norm).filter(Boolean);
    let score = 0;
    for (const n of names) {
      if (n === q) score = Math.max(score, 100);
      else if (n.includes(q) || q.includes(n)) score = Math.max(score, 80);
      else {
        const hits = words.filter((w) => w.length > 1 && n.includes(w)).length;
        score = Math.max(score, (hits / words.length) * 60);
      }
    }
    return { p, score };
  });

  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.p);
}

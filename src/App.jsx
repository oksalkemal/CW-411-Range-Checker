import { useState, useCallback, useRef } from "react";

// ─── MUSIC THEORY HELPERS ────────────────────────────────────────────────────
const STEP_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];

function pitchToMidi(step, octave, alter = 0) {
  return (parseInt(octave) + 1) * 12 + STEP_SEMI[step] + Math.round(alter || 0);
}
function midiToNote(m) {
  if (m == null || isNaN(m)) return "?";
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

// ─── SAFE RANGES (Concert Pitch, MIDI) ─────────────────────────────────────────
// Source: Instructor-verified safe ranges — all values concert pitch
const SAFE_RANGES = {
  // Standard orchestral score order — woodwinds → saxes → brass → perc → harp → strings
  // bufferHigh = caution semitones above safe high (0 = no caution, straight to red)
  // bufferLow  = caution semitones below safe low  (0 = no caution, straight to red)

  // ── Woodwinds ─────────────────────────────────────────────────────────────
  Piccolo:          { low: 74, high: 103, bufferHigh: 5, bufferLow: 0 }, // D5–G7   | caution ↑ Ab7–C8
  Flute:            { low: 60, high: 91,  bufferHigh: 5, bufferLow: 0 }, // C4–G6   | caution ↑ Ab6–C7
  Oboe:             { low: 60, high: 84,  bufferHigh: 6, bufferLow: 2 }, // C4–C6   | caution ↑ C#6–F#6 | ↓ Bb3–B3
  "English Horn":   { low: 52, high: 76,  bufferHigh: 2, bufferLow: 0 }, // E3–E5   | caution ↑ F5–F#5
  Clarinet:         { low: 52, high: 84,  bufferHigh: 6, bufferLow: 0 }, // E3–C6   | caution ↑ C#6–F#6
  Bassoon:          { low: 41, high: 70,  bufferHigh: 6, bufferLow: 7 }, // F2–Bb4  | caution ↑ B4–E5 | ↓ Bb1–E2

  // ── Saxophones ────────────────────────────────────────────────────────────
  "Soprano Sax":    { low: 56, high: 73,  bufferHigh: 6, bufferLow: 0 }, // Ab3–Db5 | caution ↑ D5–Ab5
  "Alto Sax":       { low: 49, high: 66,  bufferHigh: 6, bufferLow: 0 }, // Db3–F#4 | caution ↑ G4–C5
  "Tenor Sax":      { low: 44, high: 61,  bufferHigh: 6, bufferLow: 0 }, // Ab2–Db4 | caution ↑ D4–G4
  "Baritone Sax":   { low: 37, high: 54,  bufferHigh: 6, bufferLow: 0 }, // Db2–F#3 | caution ↑ G3–C4

  // ── Brass ─────────────────────────────────────────────────────────────────
  "French Horn":    { low: 48, high: 67,  bufferHigh: 5, bufferLow: 0 }, // C3–G4   | caution ↑ Ab4–C5
  Trumpet:          { low: 60, high: 84,  bufferHigh: 2, bufferLow: 4 }, // C4–C6   | caution ↑ C#6–D6 | ↓ Ab3–B3
  Flugelhorn:       { low: 57, high: 65,  bufferHigh: 2, bufferLow: 0 }, // A3–F4   | caution ↑ F#4–G4
  Euphonium:        { low: 40, high: 70,  bufferHigh: 6, bufferLow: 0 }, // E2–Bb4  | caution ↑ B4–E5
  "Bass Trombone":  { low: 34, high: 65,  bufferHigh: 5, bufferLow: 5 }, // Bb1–F4  | caution ↑ F#4–Bb4 | ↓ F1–A1

  // ── Percussion ────────────────────────────────────────────────────────────
  Timpani:          { low: 38, high: 57,  bufferHigh: 0, bufferLow: 0 }, // D2–A3   | no caution zones

  // ── Harp ──────────────────────────────────────────────────────────────────
  Harp:             { low: 24, high: 103, bufferHigh: 0, bufferLow: 0 }, // C1–G7   | no caution zones

  // ── Strings ───────────────────────────────────────────────────────────────
  Violin:           { low: 55, high: 93,  bufferHigh: 5, bufferLow: 0 }, // G3–A6   | caution ↑ Bb6–D7
  Viola:            { low: 48, high: 81,  bufferHigh: 5, bufferLow: 0 }, // C3–A5   | caution ↑ Bb5–D6
  Cello:            { low: 36, high: 81,  bufferHigh: 8, bufferLow: 0 }, // C2–A5   | caution ↑ Bb5–F6
  "Double Bass":    { low: 28, high: 55,  bufferHigh: 5, bufferLow: 0 }, // E1–G3   | caution ↑ Ab3–C4
};


// ─── INSTRUMENT ALIAS RESOLVER ────────────────────────────────────────────────
const ALIASES = [
  [["piccolo"], "Piccolo"],
  [["english horn","cor anglais","corno inglese"], "English Horn"],
  [["flute","flauto","flauta"], "Flute"],
  [["oboe","hautbois"], "Oboe"],
  [["bass clarinet"], "Clarinet"],
  [["clarinet","klarinette","clarinetto"], "Clarinet"],
  [["contrabassoon","double bassoon"], "Bassoon"],
  [["bassoon","fagott","fagotto"], "Bassoon"],
  [["french horn","horn in f","corno"], "French Horn"],
  [["horn"], "French Horn"],
  [["flugelhorn","flügelhorn"], "Flugelhorn"],
  [["c trumpet","trumpet in c","bb trumpet","trumpet in bb","trumpet","trompette","tromba","trompete"], "Trumpet"],
  [["bass trombone","trombone"], "Bass Trombone"],
  [["trombone","posaune"], "Trombone"],
  [["timpani","kettledrum","pauken"], "Timpani"],
  [["violin","violine","violino","fiddle"], "Violin"],
  [["viola","bratsche","viole"], "Viola"],
  [["violoncello","cello"], "Cello"],
  [["double bass","contrabass","kontrabass"], "Double Bass"],
  [["harp","harpe","arpa"], "Harp"],
  // Saxophones — order matters: more specific first
  [["soprano sax","soprano saxophone","sax soprano","saxofone soprano"], "Soprano Sax"],
  [["alto sax","alto saxophone","sax alto","saxofone alto","eb alto"], "Alto Sax"],
  [["baritone sax","bari sax","baritone saxophone","sax baritone","saxofone barítono"], "Baritone Sax"],
  [["tenor sax","tenor saxophone","sax tenor","saxofone tenor"], "Tenor Sax"],
  [["euphonium","eufonium","euphonim","baritone horn","baritono"], "Euphonium"],
];

function resolveInstrument(name) {
  const lower = (name || "").toLowerCase();
  for (const [patterns, norm] of ALIASES)
    for (const p of patterns)
      if (lower.includes(p)) return norm;
  return null;
}

// ─── MUSICXML PARSER ─────────────────────────────────────────────────────────
function parseMusicXML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid XML — check your file.");

  // Map part IDs → display names
  const partMeta = {};
  doc.querySelectorAll("score-part").forEach(sp => {
    const id = sp.getAttribute("id");
    const nameEl = sp.querySelector("part-name") || sp.querySelector("instrument-name");
    const raw = nameEl ? nameEl.textContent.trim() : id;
    partMeta[id] = { rawName: raw, normalized: resolveInstrument(raw) };
  });

  // Score title
  const titleEl = doc.querySelector("work-title") || doc.querySelector("movement-title");
  const title = titleEl ? titleEl.textContent.trim() : "Untitled Score";

  const violations = [];
  const partStats = {};
  let maxMeasure = 0;

  doc.querySelectorAll("part").forEach(part => {
    const pid = part.getAttribute("id");
    const meta = partMeta[pid] || { rawName: pid, normalized: null };
    const instrKey = meta.normalized;
    const safeRange = instrKey ? SAFE_RANGES[instrKey] : null;

    if (!partStats[pid]) partStats[pid] = { rawName: meta.rawName, normalized: instrKey, total: 0, vCount: 0, cautionCount: 0, outOfRangeCount: 0 };

    let transpose = 0; // chromatic semitones

    part.querySelectorAll("measure").forEach(measure => {
      const mNum = parseInt(measure.getAttribute("number")) || 0;
      if (mNum > maxMeasure) maxMeasure = mNum;

      // Update transpose from attributes
      measure.querySelectorAll("transpose").forEach(t => {
        const chr = t.querySelector("chromatic");
        const oct = t.querySelector("octave-change");
        if (chr) transpose = parseInt(chr.textContent) + (oct ? parseInt(oct.textContent) * 12 : 0);
      });

      measure.querySelectorAll("note").forEach(note => {
        if (note.querySelector("rest")) return;
        const pitch = note.querySelector("pitch");
        if (!pitch) return;
        const step   = pitch.querySelector("step")?.textContent;
        const octave = pitch.querySelector("octave")?.textContent;
        const alter  = parseFloat(pitch.querySelector("alter")?.textContent || 0);
        if (!step || !octave) return;

        const writtenMidi  = pitchToMidi(step, octave, alter);
        const concertMidi  = writtenMidi + transpose;
        partStats[pid].total++;

        if (safeRange) {
          const bufH = safeRange.bufferHigh || 0;
          const bufL = safeRange.bufferLow  || 0;
          const aboveSafe = concertMidi > safeRange.high;
          const belowSafe = concertMidi < safeRange.low;

          let direction = null;
          if (aboveSafe) {
            direction = (bufH > 0 && concertMidi <= safeRange.high + bufH) ? "HIGH_CAUTION" : "HIGH";
          } else if (belowSafe) {
            direction = (bufL > 0 && concertMidi >= safeRange.low - bufL) ? "LOW_CAUTION" : "LOW";
          }

          if (direction) {
            const isCaution = direction === "HIGH_CAUTION" || direction === "LOW_CAUTION";
            if (isCaution) partStats[pid].cautionCount++;
            else partStats[pid].outOfRangeCount++;
            partStats[pid].vCount++;
            violations.push({
              pid,
              displayName: meta.rawName,
              instrKey,
              measure: mNum,
              concertMidi,
              concertNote: midiToNote(concertMidi),
              writtenNote: transpose !== 0 ? midiToNote(writtenMidi) : null,
              direction,
              safeRange,
            });
          }
        }
      });
    });
  });

  violations.sort((a, b) => a.measure - b.measure || a.displayName.localeCompare(b.displayName));
  return { title, violations, partStats, maxMeasure, partMeta };
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
const COLORS = {
  bg:      "#0D0D0D",
  surface: "#181818",
  card:    "#1E1E1E",
  border:  "#2A2A2A",
  red:     "#C8102E",
  redDim:  "rgba(200,16,46,0.15)",
  redGlow: "rgba(200,16,46,0.35)",
  blue:    "#2563EB",
  blueDim: "rgba(37,99,235,0.15)",
  gold:    "#F5C842",
  amber:   "#F59E0B",
  amberDim:"rgba(245,158,11,0.15)",
  text:    "#F0EDEA",
  muted:   "#888",
  success: "#22C55E",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${COLORS.bg}; color: ${COLORS.text}; font-family: 'DM Sans', sans-serif; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: ${COLORS.surface}; }
  ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .fade-up { animation: fadeUp .45s ease both; }
  .fade-up-1 { animation: fadeUp .45s .08s ease both; }
  .fade-up-2 { animation: fadeUp .45s .16s ease both; }
  .fade-up-3 { animation: fadeUp .45s .24s ease both; }
`;

export default function App() {
  const [state, setState] = useState("idle"); // idle | loading | result | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // all | LOW | HIGH | <instrKey>
  const [expandedMeasure, setExpandedMeasure] = useState(null);
  const fileRef = useRef();

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xml") && !name.endsWith(".musicxml")) {
      setError("Please upload a MusicXML file (.xml or .musicxml). Compressed .mxl files are not supported yet.");
      setState("error");
      return;
    }
    setState("loading");
    try {
      const text = await file.text();
      const parsed = parseMusicXML(text);
      setResult(parsed);
      setState("result");
    } catch (e) {
      setError(e.message || "Could not parse file.");
      setState("error");
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const onDragOver = useCallback((e) => e.preventDefault(), []);

  // ── Derived data ──────────────────────────────────────────────────────────
  const filtered = result
    ? result.violations.filter(v =>
        filter === "all"          ? true :
        filter === "CAUTION"      ? (v.direction === "HIGH_CAUTION" || v.direction === "LOW_CAUTION") :
        filter === "OUT_OF_RANGE" ? (v.direction === "HIGH" || v.direction === "LOW") :
        v.instrKey === filter
      )
    : [];

  const SCORE_ORDER = Object.keys(SAFE_RANGES);
  const uniqueInstruments = result
    ? [...new Set(result.violations.map(v => v.instrKey).filter(Boolean))]
        .sort((a, b) => SCORE_ORDER.indexOf(a) - SCORE_ORDER.indexOf(b))
    : [];

  // Group violations by measure for heatmap
  const heatmap = result ? buildHeatmap(result) : null;

  // Stats
  const totalFlagged     = result ? result.violations.length : 0;
  const totalCaution     = result ? result.violations.filter(v => v.direction === "HIGH_CAUTION" || v.direction === "LOW_CAUTION").length : 0;
  const totalOutOfRange  = result ? result.violations.filter(v => v.direction === "HIGH" || v.direction === "LOW").length : 0;
  const affectedParts    = result ? new Set(result.violations.map(v => v.pid)).size : 0;
  const affectedMeasures = result ? new Set(result.violations.map(v => v.measure)).size : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: "100vh", background: COLORS.bg }}>

        {/* ── HEADER ────────────────────────────────────────────────── */}
        <header style={{
          borderBottom: `1px solid ${COLORS.border}`,
          background: `linear-gradient(180deg, #100508 0%, ${COLORS.bg} 100%)`,
          padding: "0 32px",
        }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: COLORS.red,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, flexShrink: 0,
              }}>🎼</div>
              <div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, letterSpacing: ".01em" }}>
                  Instrument Range Checker
                </div>
              </div>
            </div>
            {result && (
              <button
                onClick={() => { setState("idle"); setResult(null); setFilter("all"); }}
                style={{
                  background: "transparent", border: `1px solid ${COLORS.border}`,
                  color: COLORS.muted, padding: "7px 16px", borderRadius: 8,
                  cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                  transition: "all .2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.red; e.currentTarget.style.color = COLORS.text; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.muted; }}
              >
                ← New Score
              </button>
            )}
          </div>
        </header>

        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 80px" }}>

          {/* ── IDLE / UPLOAD ───────────────────────────────────────── */}
          {state === "idle" && (
            <div className="fade-up" style={{ maxWidth: 640, margin: "60px auto 0" }}>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
                Instrument Range Checker
              </h1>
              <p style={{ textAlign: "center", color: COLORS.muted, fontSize: 15, marginBottom: 40 }}>
                Upload your MusicXML score and instantly see every note that falls outside the safe ranges.
              </p>

              {/* Upload zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onClick={() => fileRef.current.click()}
                style={{
                  border: `2px dashed ${COLORS.border}`,
                  borderRadius: 16, padding: "56px 32px",
                  textAlign: "center", cursor: "pointer",
                  background: COLORS.surface,
                  transition: "all .2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.red; e.currentTarget.style.background = COLORS.redDim; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.background = COLORS.surface; }}
              >
                <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
                <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Drop your score here</div>
                <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 20 }}>or click to browse</div>
                <div style={{
                  display: "inline-block", background: COLORS.red, color: "#fff",
                  padding: "10px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                }}>
                  Choose MusicXML File
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 16 }}>
                  Accepts .xml · .musicxml &nbsp;|&nbsp; Export from Sibelius, Finale, MuseScore, Dorico
                </div>
                <div style={{
                  marginTop: 12,
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "rgba(245,200,66,0.1)", border: "1px solid rgba(245,200,66,0.35)",
                  borderRadius: 6, padding: "5px 12px",
                }}>
                  <span style={{ fontSize: 14 }}>⚠️</span>
                  <span style={{ fontSize: 11, color: "#F5C842", fontWeight: 500 }}>
                    Compressed .mxl files are <u>not</u> supported — export as uncompressed MusicXML (.xml) from your notation software
                  </span>
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".xml,.musicxml" style={{ display: "none" }}
                onChange={e => handleFile(e.target.files[0])} />

              {/* Safe range reference */}
              <div style={{ marginTop: 36 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: COLORS.muted, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <span>Safe Range Reference (Concert Pitch)</span>
                  <span style={{ textTransform: "none", letterSpacing: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: COLORS.muted, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: "1px 6px" }}>Middle C = C4</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                  {Object.entries(SAFE_RANGES).map(([name, r]) => (
                    <div key={name} style={{
                      background: COLORS.card, border: `1px solid ${COLORS.border}`,
                      borderRadius: 8, padding: "8px 12px", display: "flex",
                      justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{ fontSize: 13, color: COLORS.text }}>{name}</span>
                      <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: COLORS.gold }}>
                        {midiToNote(r.low)}–{midiToNote(r.high)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── LOADING ─────────────────────────────────────────────── */}
          {state === "loading" && (
            <div style={{ textAlign: "center", padding: "100px 0" }}>
              <div style={{ width: 40, height: 40, border: `3px solid ${COLORS.border}`, borderTopColor: COLORS.red, borderRadius: "50%", margin: "0 auto 20px", animation: "spin 1s linear infinite" }} />
              <div style={{ color: COLORS.muted }}>Analyzing score…</div>
            </div>
          )}

          {/* ── ERROR ───────────────────────────────────────────────── */}
          {state === "error" && (
            <div className="fade-up" style={{ maxWidth: 520, margin: "60px auto", background: COLORS.redDim, border: `1px solid ${COLORS.red}`, borderRadius: 12, padding: 28, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Could not analyze score</div>
              <div style={{ color: COLORS.muted, fontSize: 14, marginBottom: 20 }}>{error}</div>
              <button onClick={() => setState("idle")} style={{ background: COLORS.red, color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>
                Try Again
              </button>
            </div>
          )}

          {/* ── RESULTS ─────────────────────────────────────────────── */}
          {state === "result" && result && (
            <div>
              {/* Score title */}
              <div className="fade-up" style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: COLORS.muted, marginBottom: 4 }}>
                  Analyzing
                </div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700 }}>
                  {result.title}
                </h2>
              </div>

              {/* Stats row */}
              <div className="fade-up-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
                <div style={{ background: COLORS.card, border: `1px solid ${totalOutOfRange > 0 ? COLORS.red : COLORS.border}`, borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: COLORS.muted, marginBottom: 8 }}>Out of Range</div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: totalOutOfRange > 0 ? COLORS.red : COLORS.success, fontFamily: "'JetBrains Mono', monospace" }}>{totalOutOfRange}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>notes to rewrite</div>
                </div>
                <div style={{ background: COLORS.card, border: `1px solid ${totalCaution > 0 ? COLORS.amber : COLORS.border}`, borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: COLORS.muted, marginBottom: 8 }}>Caution Zone</div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: totalCaution > 0 ? COLORS.amber : COLORS.success, fontFamily: "'JetBrains Mono', monospace" }}>{totalCaution}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>notes to review</div>
                </div>
                <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: COLORS.muted, marginBottom: 8 }}>Parts Flagged</div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: COLORS.gold, fontFamily: "'JetBrains Mono', monospace" }}>{affectedParts}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>of {Object.keys(result.partStats).length} parts</div>
                </div>
                <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: COLORS.muted, marginBottom: 8 }}>Measures Flagged</div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: "#A78BFA", fontFamily: "'JetBrains Mono', monospace" }}>{affectedMeasures}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>of {result.maxMeasure} total</div>
                </div>
              </div>

              {totalFlagged === 0 ? (
                <div className="fade-up-2" style={{ textAlign: "center", padding: "60px 32px", background: `rgba(34,197,94,.08)`, border: `1px solid rgba(34,197,94,.25)`, borderRadius: 16 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: COLORS.success, marginBottom: 8 }}>All notes within safe ranges!</div>
                  <div style={{ color: COLORS.muted }}>No range issues detected in this score.</div>
                </div>
              ) : (
                <>
                  {/* Heatmap */}
                  <div className="fade-up-2" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 20, overflowX: "auto" }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: COLORS.muted, marginBottom: 16 }}>
                      Score Overview — Notes to Review
                    </div>
                    <ScoreHeatmap heatmap={heatmap} result={result} onSelectMeasure={setExpandedMeasure} selectedMeasure={expandedMeasure} />
                  </div>

                  {/* Part breakdown */}
                  <div className="fade-up-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 24 }}>
                    {Object.entries(result.partStats)
                      .filter(([,s]) => s.vCount > 0)
                      .sort(([,a],[,b]) => b.vCount - a.vCount)
                      .map(([pid, s]) => (
                        <PartCard key={pid} s={s} onClick={() => setFilter(f => f === s.normalized ? "all" : s.normalized)} active={filter === s.normalized} />
                      ))}
                  </div>

                  {/* Filter bar */}
                  <div className="fade-up-3" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: COLORS.muted, marginRight: 4 }}>Filter:</span>
                    <FilterChip label="All Notes to Review" active={filter === "all"} onClick={() => setFilter("all")} color="default" />
                    <FilterChip label="🔴 Out of Range" active={filter === "OUT_OF_RANGE"} onClick={() => setFilter("OUT_OF_RANGE")} color="red" />
                    <FilterChip label="🟡 Caution" active={filter === "CAUTION"} onClick={() => setFilter("CAUTION")} color="amber" />
                    <FilterChip label="⬇ Too Low" active={filter === "LOW"} onClick={() => setFilter("LOW")} color="blue" />
                    {uniqueInstruments.map(f => (
                      <FilterChip key={f} label={f} active={filter === f} onClick={() => setFilter(f)} color="default" />
                    ))}
                    {filter !== "all" && <span style={{ fontSize: 12, color: COLORS.muted }}>{filtered.length} shown</span>}
                  </div>

                  {/* Notes to Review table */}
                  <div className="fade-up-3" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Notes to Review</div>
                      <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'JetBrains Mono',monospace" }}>{filtered.length} note{filtered.length !== 1 ? "s" : ""}</div>
                    </div>

                    {/* Table header */}
                    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 110px 90px 90px 1fr", gap: 0, padding: "8px 20px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: COLORS.muted }}>
                      <span>Measure</span><span>Instrument</span><span>Note</span><span>Direction</span><span>Concert</span><span>Safe Range</span>
                    </div>

                    <div style={{ maxHeight: 480, overflowY: "auto" }}>
                      {filtered.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, color: COLORS.muted }}>No notes match this filter.</div>
                      ) : (
                        filtered.map((v, i) => <ViolationRow key={i} v={v} i={i} />)
                      )}
                    </div>
                  </div>

                  {/* Per-instrument breakdown */}
                  <div style={{ marginTop: 24 }}>
                    <div className="fade-up-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: COLORS.muted, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                      <span>Safe Ranges Reference</span>
                      <span style={{ textTransform: "none", letterSpacing: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: COLORS.muted, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: "1px 6px" }}>Middle C = C4</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                      {Object.entries(SAFE_RANGES).map(([name, r]) => {
                        const hasHigh    = result.violations.some(v => v.instrKey === name && v.direction === "HIGH");
                        const hasLow     = result.violations.some(v => v.instrKey === name && v.direction === "LOW");
                        const hasCaution = result.violations.some(v => v.instrKey === name && (v.direction === "HIGH_CAUTION" || v.direction === "LOW_CAUTION"));
                        // Priority: red (too high) > blue (too low) > amber (caution only)
                        const borderCol = hasHigh ? COLORS.red : hasLow ? COLORS.blue : hasCaution ? COLORS.amber : COLORS.border;
                        const bgCol     = hasHigh ? COLORS.redDim : hasLow ? COLORS.blueDim : hasCaution ? COLORS.amberDim : COLORS.card;
                        const noteCol   = hasHigh ? COLORS.red : hasLow ? COLORS.blue : hasCaution ? COLORS.amber : COLORS.gold;
                        return (
                          <div key={name} style={{
                            background: bgCol,
                            border: `1px solid ${borderCol}`,
                            borderRadius: 8, padding: "8px 12px",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}>
                            <span style={{ fontSize: 12 }}>{name}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: noteCol }}>
                                {midiToNote(r.low)}–{midiToNote(r.high)}
                              </span>
                              {(r.bufferHigh > 0 || r.bufferLow > 0) && (
                                <span style={{ fontSize: 9, color: COLORS.amber, fontFamily: "'JetBrains Mono',monospace" }}>
                                  {r.bufferLow > 0 ? `-${r.bufferLow}/` : ""}{r.bufferHigh > 0 ? `+${r.bufferHigh}` : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function ViolationRow({ v, i }) {
  const dir = v.direction;
  const isHighCaution = dir === "HIGH_CAUTION";
  const isLowCaution  = dir === "LOW_CAUTION";
  const isHigh        = dir === "HIGH";
  const isLow         = dir === "LOW";
  const isCaution     = isHighCaution || isLowCaution;
  const noteColor    = isCaution ? COLORS.amber : isLow ? COLORS.blue : COLORS.red;
  const badgeBg      = isCaution ? COLORS.amberDim : isLow ? COLORS.blueDim : COLORS.redDim;
  const badgeBorder  = isCaution ? COLORS.amber : isLow ? "#2563EB" : COLORS.red;
  const badgeLabel   = isHighCaution ? "🟡 High Caution"
                     : isLowCaution  ? "🟡 Low Caution"
                     : isHigh        ? "🔴 Too High"
                     :                 "🔴 Too Low";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "80px 1fr 110px 120px 90px 1fr",
      padding: "10px 20px",
      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.02)",
      borderBottom: `1px solid ${COLORS.border}`,
      alignItems: "center",
      fontSize: 13,
    }}>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", color: COLORS.gold, fontWeight: 600 }}>
        m.{v.measure}
      </span>
      <span style={{ fontWeight: 500 }}>{v.displayName}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: noteColor }}>
        {v.concertNote}
        {v.writtenNote && <span style={{ fontSize: 10, color: COLORS.muted, fontWeight: 400 }}> (wr:{v.writtenNote})</span>}
      </span>
      <span>
        <span style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
          background: badgeBg, color: noteColor, border: `1px solid ${badgeBorder}`,
        }}>
          {badgeLabel}
        </span>
      </span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: noteColor }}>
        {v.concertNote}
      </span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: COLORS.muted }}>
        {midiToNote(v.safeRange.low)}–{midiToNote(v.safeRange.high)}
        {v.safeRange.bufferHigh && <span style={{ color: COLORS.amber }}> (+{v.safeRange.bufferHigh})</span>}
      </span>
    </div>
  );
}

function FilterChip({ label, active, onClick, color = "default" }) {
  const activeColor = color === "red" ? COLORS.red : color === "amber" ? COLORS.amber : color === "blue" ? "#2563EB" : COLORS.red;
  return (
    <button onClick={onClick} style={{
      background: active ? activeColor : COLORS.card,
      border: `1px solid ${active ? activeColor : COLORS.border}`,
      color: active ? "#fff" : COLORS.text,
      padding: "5px 12px", borderRadius: 6, cursor: "pointer",
      fontSize: 12, fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
      transition: "all .15s",
    }}>
      {label}
    </button>
  );
}

function PartCard({ s, onClick, active }) {
  const pct         = s.total > 0 ? Math.round((s.vCount / s.total) * 100) : 0;
  const dangerPct   = s.total > 0 ? Math.round((s.outOfRangeCount / s.total) * 100) : 0;
  const cautionPct  = s.total > 0 ? Math.round((s.cautionCount / s.total) * 100) : 0;
  const borderColor = active ? (s.outOfRangeCount > 0 ? COLORS.red : COLORS.amber) : COLORS.border;
  const bgColor     = active ? (s.outOfRangeCount > 0 ? COLORS.redDim : COLORS.amberDim) : COLORS.card;
  return (
    <button onClick={onClick} style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 10, padding: "12px 16px", cursor: "pointer",
      textAlign: "left", transition: "all .15s", fontFamily: "'DM Sans',sans-serif",
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = "#444"; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = COLORS.border; }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 6 }}>{s.rawName}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1, height: 6, background: "#333", borderRadius: 3, overflow: "hidden", display: "flex" }}>
          <div style={{ width: `${Math.min(dangerPct, 100)}%`, height: "100%", background: COLORS.red }} />
          <div style={{ width: `${Math.min(cautionPct, 100 - dangerPct)}%`, height: "100%", background: COLORS.amber }} />
        </div>
        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: s.outOfRangeCount > 0 ? COLORS.red : COLORS.amber, fontWeight: 700 }}>
          {s.vCount}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
        {s.outOfRangeCount > 0 && <span style={{ color: COLORS.red }}>🔴 {s.outOfRangeCount} out of range</span>}
        {s.cautionCount > 0    && <span style={{ color: COLORS.amber }}>🟡 {s.cautionCount} caution</span>}
      </div>
    </button>
  );
}

function buildHeatmap(result) {
  // { [partId]: { [measure]: { high: n, low: n, caution: n } } }
  const map = {};
  result.violations.forEach(v => {
    if (!map[v.pid]) map[v.pid] = {};
    if (!map[v.pid][v.measure]) map[v.pid][v.measure] = { high: 0, low: 0, caution: 0 };
    if (v.direction === "HIGH")                                    map[v.pid][v.measure].high++;
    else if (v.direction === "LOW")                                map[v.pid][v.measure].low++;
    else if (v.direction === "HIGH_CAUTION" || v.direction === "LOW_CAUTION") map[v.pid][v.measure].caution++;
  });
  return map;
}

function ScoreHeatmap({ heatmap, result, onSelectMeasure, selectedMeasure }) {
  if (!heatmap || !result) return null;
  const parts = Object.entries(result.partStats).filter(([,s]) => s.vCount > 0);
  const measures = result.maxMeasure;
  const CELL = 14;
  const LABEL_W = 140;
  // Show max 80 measures at a time; can scroll
  const maxShow = Math.min(measures, 100);
  const measureNums = Array.from({ length: maxShow }, (_, i) => i + 1);

  return (
    <div style={{ overflowX: "auto" }}>
      {/* Measure numbers header */}
      <div style={{ display: "flex", marginLeft: LABEL_W, marginBottom: 4 }}>
        {measureNums.map(m => (
          <div key={m} style={{
            width: CELL, flexShrink: 0, textAlign: "center",
            fontSize: 8, color: m % 5 === 0 ? COLORS.muted : "transparent",
            fontFamily: "'JetBrains Mono',monospace",
          }}>
            {m}
          </div>
        ))}
      </div>
      {/* Rows */}
      {parts.map(([pid, s]) => {
        const rowData = heatmap[pid] || {};
        return (
          <div key={pid} style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
            <div style={{ width: LABEL_W, flexShrink: 0, fontSize: 11, color: COLORS.text, paddingRight: 10, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.rawName}
            </div>
            {measureNums.map(m => {
              const cell       = rowData[m] || { high: 0, low: 0, caution: 0 };
              const total      = cell.high + cell.low + cell.caution;
              const isSelected = selectedMeasure === m;
              // Priority: too high (red) > too low (blue) > caution (amber)
              const bg = total === 0
                ? "#222"
                : cell.high > 0
                  ? `rgba(200,16,46,${0.4 + Math.min(cell.high / 4, 1) * 0.6})`
                  : cell.low > 0
                    ? `rgba(37,99,235,${0.4 + Math.min(cell.low / 4, 1) * 0.6})`
                    : `rgba(245,158,11,${0.4 + Math.min(cell.caution / 4, 1) * 0.6})`;
              const parts = [
                cell.high    > 0 ? `${cell.high} too high`    : "",
                cell.low     > 0 ? `${cell.low} too low`      : "",
                cell.caution > 0 ? `${cell.caution} caution`  : "",
              ].filter(Boolean);
              const title = total === 0 ? `m.${m}: OK` : `m.${m}: ${parts.join(" · ")}`;
              return (
                <div key={m}
                  onClick={() => total > 0 && onSelectMeasure(isSelected ? null : m)}
                  title={title}
                  style={{
                    width: CELL, height: CELL, flexShrink: 0,
                    background: bg,
                    border: isSelected ? `1px solid ${COLORS.gold}` : "1px solid transparent",
                    borderRadius: 2, cursor: total > 0 ? "pointer" : "default",
                    transition: "opacity .1s",
                  }}
                />
              );
            })}
          </div>
        );
      })}
      {measures > maxShow && (
        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 8, marginLeft: LABEL_W }}>
          Showing first {maxShow} of {measures} measures. Violations in measures {maxShow + 1}–{measures} still appear in the table below.
        </div>
      )}
      <div style={{ display: "flex", gap: 16, marginTop: 12, marginLeft: LABEL_W, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 12, height: 12, background: "#222", borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: COLORS.muted }}>Within range</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 12, height: 12, background: COLORS.amber, borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: COLORS.amber }}>Caution zone</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 12, height: 12, background: COLORS.blue, borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: COLORS.blue }}>Too Low</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 12, height: 12, background: COLORS.red, borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: COLORS.red }}>Too High</span>
        </div>
      </div>
    </div>
  );
}

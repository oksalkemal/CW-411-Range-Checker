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

// ─── SAFE RANGES (Concert Pitch, MIDI) — CW-411 ──────────────────────────────
// Source: CW-411 Safe Ranges PDF — all values concert pitch
const SAFE_RANGES = {
  Piccolo:        { low: 74, high: 96  }, // D5–C7
  Flute:          { low: 60, high: 93  }, // C4–A6
  Oboe:           { low: 58, high: 89  }, // Bb3–F6
  "English Horn": { low: 52, high: 81  }, // E3–A5
  Clarinet:       { low: 50, high: 84  }, // D3–C6 (concert)
  Bassoon:        { low: 34, high: 75  }, // Bb1–Eb5
  "French Horn":  { low: 42, high: 77  }, // F#2–F5
  Trumpet:        { low: 52, high: 84  }, // E3–C6 (concert)
  Flugelhorn:     { low: 52, high: 82  }, // E3–Bb5 (concert)
  "Bass Trombone":{ low: 22, high: 70  }, // Bb0–Bb4
  Trombone:       { low: 40, high: 72  }, // E2–C5
  Timpani:        { low: 38, high: 57  }, // D2–A3
  Violin:         { low: 55, high: 93  }, // G3–A6
  Viola:          { low: 48, high: 81  }, // C3–A5
  Cello:          { low: 36, high: 81  }, // C2–A5
  "Double Bass":  { low: 28, high: 55  }, // E1–G3 (concert, sounds 8va lower)
  Harp:           { low: 24, high: 103 }, // C1–G7
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
  [["trumpet","trompette","tromba","trompete"], "Trumpet"],
  [["bass trombone"], "Bass Trombone"],
  [["trombone","posaune"], "Trombone"],
  [["timpani","kettledrum","pauken"], "Timpani"],
  [["violin","violine","violino","fiddle"], "Violin"],
  [["viola","bratsche","viole"], "Viola"],
  [["violoncello","cello"], "Cello"],
  [["double bass","contrabass","kontrabass"], "Double Bass"],
  [["harp","harpe","arpa"], "Harp"],
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

    if (!partStats[pid]) partStats[pid] = { rawName: meta.rawName, normalized: instrKey, total: 0, vCount: 0 };

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

        if (safeRange && (concertMidi < safeRange.low || concertMidi > safeRange.high)) {
          partStats[pid].vCount++;
          violations.push({
            pid,
            displayName: meta.rawName,
            instrKey,
            measure: mNum,
            concertMidi,
            concertNote: midiToNote(concertMidi),
            writtenNote: transpose !== 0 ? midiToNote(writtenMidi) : null,
            direction: concertMidi < safeRange.low ? "LOW" : "HIGH",
            safeRange,
          });
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
        filter === "all" ? true :
        filter === "LOW" || filter === "HIGH" ? v.direction === filter :
        v.instrKey === filter
      )
    : [];

  const uniqueInstruments = result
    ? [...new Set(result.violations.map(v => v.instrKey).filter(Boolean))]
    : [];

  // Group violations by measure for heatmap
  const heatmap = result ? buildHeatmap(result) : null;

  // Stats
  const totalViolations  = result ? result.violations.length : 0;
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
                  Range Checker
                </div>
                <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 500, letterSpacing: ".08em", textTransform: "uppercase", marginTop: 1 }}>
                  Berklee CW-411 · Contemporary Writing & Production
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
                Safe Range Detection
              </h1>
              <p style={{ textAlign: "center", color: COLORS.muted, fontSize: 15, marginBottom: 40 }}>
                Upload your MusicXML score and instantly see every note that falls outside CW-411 safe ranges.
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
              </div>
              <input ref={fileRef} type="file" accept=".xml,.musicxml" style={{ display: "none" }}
                onChange={e => handleFile(e.target.files[0])} />

              {/* Safe range reference */}
              <div style={{ marginTop: 36 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: COLORS.muted, marginBottom: 12 }}>
                  CW-411 Safe Range Reference (Concert Pitch)
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
                {[
                  { label: "Total Violations", value: totalViolations, accent: totalViolations > 0 ? COLORS.red : COLORS.success, icon: totalViolations > 0 ? "⚠" : "✓" },
                  { label: "Parts Affected", value: affectedParts, accent: COLORS.gold, icon: "🎻" },
                  { label: "Measures w/ Issues", value: affectedMeasures, accent: "#A78BFA", icon: "📏" },
                  { label: "Total Measures", value: result.maxMeasure, accent: COLORS.muted, icon: "📄" },
                ].map(s => (
                  <div key={s.label} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "16px 20px" }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: COLORS.muted, marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: s.accent, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {totalViolations === 0 ? (
                <div className="fade-up-2" style={{ textAlign: "center", padding: "60px 32px", background: `rgba(34,197,94,.08)`, border: `1px solid rgba(34,197,94,.25)`, borderRadius: 16 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: COLORS.success, marginBottom: 8 }}>All notes within safe ranges!</div>
                  <div style={{ color: COLORS.muted }}>No CW-411 range violations detected in this score.</div>
                </div>
              ) : (
                <>
                  {/* Heatmap */}
                  <div className="fade-up-2" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 20, overflowX: "auto" }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: COLORS.muted, marginBottom: 16 }}>
                      Score Overview — Violation Heatmap
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
                    {["all","LOW","HIGH",...uniqueInstruments].map(f => (
                      <FilterChip key={f} label={f === "all" ? "All Violations" : f === "LOW" ? "⬇ Too Low" : f === "HIGH" ? "⬆ Too High" : f}
                        active={filter === f} onClick={() => setFilter(f)} />
                    ))}
                    {filter !== "all" && <span style={{ fontSize: 12, color: COLORS.muted }}>{filtered.length} shown</span>}
                  </div>

                  {/* Violations table */}
                  <div className="fade-up-3" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Violation Details</div>
                      <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'JetBrains Mono',monospace" }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</div>
                    </div>

                    {/* Table header */}
                    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 110px 90px 90px 1fr", gap: 0, padding: "8px 20px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: COLORS.muted }}>
                      <span>Measure</span><span>Instrument</span><span>Note</span><span>Direction</span><span>Concert</span><span>Safe Range</span>
                    </div>

                    <div style={{ maxHeight: 480, overflowY: "auto" }}>
                      {filtered.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, color: COLORS.muted }}>No violations match this filter.</div>
                      ) : (
                        filtered.map((v, i) => <ViolationRow key={i} v={v} i={i} />)
                      )}
                    </div>
                  </div>

                  {/* Per-instrument breakdown */}
                  <div style={{ marginTop: 24 }}>
                    <div className="fade-up-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: COLORS.muted, marginBottom: 12 }}>
                      CW-411 Safe Ranges Reference
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                      {Object.entries(SAFE_RANGES).map(([name, r]) => {
                        const hasViolation = result.violations.some(v => v.instrKey === name);
                        return (
                          <div key={name} style={{
                            background: hasViolation ? COLORS.redDim : COLORS.card,
                            border: `1px solid ${hasViolation ? COLORS.red : COLORS.border}`,
                            borderRadius: 8, padding: "8px 12px",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}>
                            <span style={{ fontSize: 12 }}>{name}</span>
                            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: hasViolation ? COLORS.red : COLORS.gold }}>
                              {midiToNote(r.low)}–{midiToNote(r.high)}
                            </span>
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
  const isHigh = v.direction === "HIGH";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "80px 1fr 110px 90px 90px 1fr",
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
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: isHigh ? COLORS.red : COLORS.blue }}>
        {v.concertNote}
        {v.writtenNote && <span style={{ fontSize: 10, color: COLORS.muted, fontWeight: 400 }}> (wr:{v.writtenNote})</span>}
      </span>
      <span>
        <span style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
          background: isHigh ? COLORS.redDim : COLORS.blueDim,
          color: isHigh ? COLORS.red : "#60A5FA",
          border: `1px solid ${isHigh ? COLORS.red : "#2563EB"}`,
        }}>
          {isHigh ? "▲ HIGH" : "▼ LOW"}
        </span>
      </span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: isHigh ? COLORS.red : "#60A5FA" }}>
        {v.concertNote}
      </span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: COLORS.muted }}>
        {midiToNote(v.safeRange.low)}–{midiToNote(v.safeRange.high)}
      </span>
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? COLORS.red : COLORS.card,
      border: `1px solid ${active ? COLORS.red : COLORS.border}`,
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
  const pct = s.total > 0 ? Math.round((s.vCount / s.total) * 100) : 0;
  return (
    <button onClick={onClick} style={{
      background: active ? COLORS.redDim : COLORS.card,
      border: `1px solid ${active ? COLORS.red : COLORS.border}`,
      borderRadius: 10, padding: "12px 16px", cursor: "pointer",
      textAlign: "left", transition: "all .15s", fontFamily: "'DM Sans',sans-serif",
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = "#444"; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = COLORS.border; }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 6 }}>{s.rawName}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 4, background: "#333", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: COLORS.red, borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: COLORS.red, fontWeight: 700 }}>
          {s.vCount}
        </span>
      </div>
      <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 4 }}>
        {pct}% of notes out of range
      </div>
    </button>
  );
}

function buildHeatmap(result) {
  // { [partId]: { [measure]: count } }
  const map = {};
  result.violations.forEach(v => {
    if (!map[v.pid]) map[v.pid] = {};
    map[v.pid][v.measure] = (map[v.pid][v.measure] || 0) + 1;
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
              const count = rowData[m] || 0;
              const isSelected = selectedMeasure === m;
              const intensity = count === 0 ? 0 : Math.min(count / 4, 1);
              const bg = count === 0
                ? "#222"
                : `rgba(200,16,46,${0.25 + intensity * 0.75})`;
              return (
                <div key={m}
                  onClick={() => count > 0 && onSelectMeasure(isSelected ? null : m)}
                  title={count > 0 ? `m.${m}: ${count} violation${count !== 1 ? "s" : ""}` : `m.${m}: OK`}
                  style={{
                    width: CELL, height: CELL, flexShrink: 0,
                    background: bg,
                    border: isSelected ? `1px solid ${COLORS.gold}` : "1px solid transparent",
                    borderRadius: 2, cursor: count > 0 ? "pointer" : "default",
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
      <div style={{ display: "flex", gap: 16, marginTop: 12, marginLeft: LABEL_W, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 12, height: 12, background: "#222", borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: COLORS.muted }}>OK</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 12, height: 12, background: "rgba(200,16,46,.4)", borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: COLORS.muted }}>1–2 violations</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 12, height: 12, background: COLORS.red, borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: COLORS.muted }}>3+ violations</span>
        </div>
      </div>
    </div>
  );
}

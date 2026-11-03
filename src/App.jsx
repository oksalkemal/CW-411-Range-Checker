import { useState, useCallback, useRef } from "react";
import JSZip from "jszip";

/* ═══════════════════════════════════════════════════════════════════════════
   1. MUSIC THEORY HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */
const STEP_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function pitchToMidi(step, octave, alter = 0) {
  return (parseInt(octave) + 1) * 12 + STEP_SEMI[step] + Math.round(alter || 0);
}
function midiToNote(m) {
  if (m == null || isNaN(m)) return "?";
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. SAFE RANGES (Concert Pitch, MIDI) — instructor verified
   Standard orchestral score order. bufferHigh/bufferLow = caution semitones.
   ═══════════════════════════════════════════════════════════════════════════ */
const SAFE_RANGES = {
  // ── Woodwinds ──
  Piccolo:         { low: 74, high: 103, bufferHigh: 5, bufferLow: 0 }, // D5–G7
  Flute:           { low: 60, high: 91,  bufferHigh: 5, bufferLow: 0 }, // C4–G6
  Oboe:            { low: 60, high: 84,  bufferHigh: 6, bufferLow: 2 }, // C4–C6
  "English Horn":  { low: 52, high: 76,  bufferHigh: 2, bufferLow: 0 }, // E3–E5
  Clarinet:        { low: 52, high: 84,  bufferHigh: 6, bufferLow: 0 }, // E3–C6
  Bassoon:         { low: 41, high: 70,  bufferHigh: 6, bufferLow: 7 }, // F2–Bb4
  // ── Saxophones ──
  "Soprano Sax":   { low: 56, high: 73,  bufferHigh: 6, bufferLow: 0 }, // Ab3–Db5
  "Alto Sax":      { low: 49, high: 66,  bufferHigh: 6, bufferLow: 0 }, // Db3–F#4
  "Tenor Sax":     { low: 44, high: 61,  bufferHigh: 6, bufferLow: 0 }, // Ab2–Db4
  "Baritone Sax":  { low: 37, high: 54,  bufferHigh: 6, bufferLow: 0 }, // Db2–F#3
  // ── Brass ──
  "French Horn":   { low: 48, high: 67,  bufferHigh: 5, bufferLow: 0 }, // C3–G4
  Trumpet:         { low: 60, high: 84,  bufferHigh: 2, bufferLow: 4 }, // C4–C6
  Flugelhorn:      { low: 57, high: 65,  bufferHigh: 2, bufferLow: 0 }, // A3–F4
  Euphonium:       { low: 40, high: 70,  bufferHigh: 6, bufferLow: 0 }, // E2–Bb4
  "Bass Trombone": { low: 34, high: 65,  bufferHigh: 5, bufferLow: 5 }, // Bb1–F4
  // ── Percussion ──
  Timpani:         { low: 38, high: 57,  bufferHigh: 0, bufferLow: 0 }, // D2–A3
  // ── Harp ──
  Harp:            { low: 24, high: 103, bufferHigh: 0, bufferLow: 0 }, // C1–G7
  // ── Strings ──
  Violin:          { low: 55, high: 93,  bufferHigh: 5, bufferLow: 0 }, // G3–A6
  Viola:           { low: 48, high: 81,  bufferHigh: 5, bufferLow: 0 }, // C3–A5
  Cello:           { low: 36, high: 81,  bufferHigh: 8, bufferLow: 0 }, // C2–A5
  "Double Bass":   { low: 28, high: 55,  bufferHigh: 5, bufferLow: 0 }, // E1–G3
};

const SCORE_ORDER = Object.keys(SAFE_RANGES);

/* ═══════════════════════════════════════════════════════════════════════════
   3. INSTRUMENT ALIAS RESOLVER
   ═══════════════════════════════════════════════════════════════════════════ */
const ALIASES = [
  [["piccolo"], "Piccolo"],
  [["english horn", "cor anglais", "corno inglese"], "English Horn"],
  [["flute", "flauto", "flauta"], "Flute"],
  [["oboe", "hautbois"], "Oboe"],
  [["bass clarinet"], "Clarinet"],
  [["clarinet", "klarinette", "clarinetto"], "Clarinet"],
  [["contrabassoon", "double bassoon"], "Bassoon"],
  [["bassoon", "fagott", "fagotto"], "Bassoon"],
  [["french horn", "horn in f", "corno"], "French Horn"],
  [["horn"], "French Horn"],
  [["flugelhorn", "flügelhorn"], "Flugelhorn"],
  [["c trumpet", "trumpet in c", "bb trumpet", "trumpet in bb", "trumpet", "trompette", "tromba", "trompete"], "Trumpet"],
  [["bass trombone", "trombone"], "Bass Trombone"],
  [["timpani", "kettledrum", "pauken"], "Timpani"],
  [["violin", "violine", "violino", "fiddle"], "Violin"],
  [["viola", "bratsche", "viole"], "Viola"],
  [["violoncello", "cello"], "Cello"],
  [["double bass", "contrabass", "kontrabass"], "Double Bass"],
  [["harp", "harpe", "arpa"], "Harp"],
  [["soprano sax", "soprano saxophone", "sax soprano"], "Soprano Sax"],
  [["alto sax", "alto saxophone", "sax alto", "eb alto"], "Alto Sax"],
  [["baritone sax", "bari sax", "baritone saxophone", "sax baritone"], "Baritone Sax"],
  [["tenor sax", "tenor saxophone", "sax tenor"], "Tenor Sax"],
  [["euphonium", "eufonium", "baritone horn", "baritono"], "Euphonium"],
];

function resolveInstrument(name) {
  const lower = (name || "").toLowerCase();
  for (const [patterns, norm] of ALIASES)
    for (const p of patterns) if (lower.includes(p)) return norm;
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. MXL (compressed MusicXML) EXTRACTOR
   ═══════════════════════════════════════════════════════════════════════════ */
async function extractMxl(file) {
  const zip = await JSZip.loadAsync(file);
  const containerEntry = zip.file("META-INF/container.xml");
  if (containerEntry) {
    const containerText = await containerEntry.async("string");
    const doc = new DOMParser().parseFromString(containerText, "application/xml");
    const rootPath = doc.querySelector("rootfile")?.getAttribute("full-path");
    if (rootPath && zip.file(rootPath)) return await zip.file(rootPath).async("string");
  }
  const xmlEntry = Object.values(zip.files).find(
    f => !f.dir && f.name.endsWith(".xml") && !f.name.startsWith("META-INF")
  );
  if (xmlEntry) return await xmlEntry.async("string");
  throw new Error("Could not find MusicXML content inside the .mxl file.");
}

/* ═══════════════════════════════════════════════════════════════════════════
   4b. STRING HARMONICS — data and resolvers
   Open strings in concert pitch. maxStopped = highest practical stopped note
   for an artificial harmonic (one octave above the top open string; past that
   the hand cannot hold the 4th stretch).
   ═══════════════════════════════════════════════════════════════════════════ */
const STRING_DATA = {
  Violin:        { opens: [55, 62, 69, 76], maxStopped: 88 }, // G3 D4 A4 E5
  Viola:         { opens: [48, 55, 62, 69], maxStopped: 81 }, // C3 G3 D4 A4
  Cello:         { opens: [36, 43, 50, 57], maxStopped: 69 }, // C2 G2 D3 A3
  "Double Bass": { opens: [28, 33, 38, 43], maxStopped: 55 }, // E1 A1 D2 G2 (sounding)
};

const PARTIAL_SEMI  = { 2: 12, 3: 19, 4: 24, 5: 28, 6: 31, 7: 34, 8: 36 };
const PARTIAL_CENTS = { 2: 0, 3: +2, 4: 0, 5: -14, 6: +2, 7: -31, 8: 0 };

// Touch-node intervals above the open string that produce each partial
const PARTIAL_NODES = {
  2: [12], 3: [7, 19], 4: [5, 24], 5: [4, 9, 16, 28],
  6: [3, 31], 7: [2, 34], 8: [1, 36],
};

// Artificial harmonics: interval from stopped note up to the touch point
const ARTIFICIAL_INTERVALS = {
  5: { partial: 4, name: "perfect 4th", verdict: "ok" },
  7: { partial: 3, name: "perfect 5th", verdict: "caution" },
  4: { partial: 5, name: "major 3rd",   verdict: "error" },
  3: { partial: 6, name: "minor 3rd",   verdict: "error" },
};

const RELIABLE_PARTIAL_MAX = 6; // 7th partial is 31 cents flat

function resolveNaturalFromTouch(touchMidi, instrKey) {
  const data = STRING_DATA[instrKey];
  if (!data) return null;
  let best = null;
  for (const open of data.opens) {
    const iv = touchMidi - open;
    if (iv <= 0) continue;
    for (const p of [2, 3, 4, 5, 6, 7, 8])
      if (PARTIAL_NODES[p].includes(iv) && (!best || p < best.partial))
        best = { open, partial: p, sounding: open + PARTIAL_SEMI[p] };
  }
  return best;
}

function resolveNaturalFromSounding(soundingMidi, instrKey) {
  const data = STRING_DATA[instrKey];
  if (!data) return null;
  let best = null;
  for (const open of data.opens)
    for (const p of [2, 3, 4, 5, 6, 7, 8])
      if (open + PARTIAL_SEMI[p] === soundingMidi && (!best || p < best.partial))
        best = { open, partial: p, sounding: soundingMidi };
  return best;
}

function resolveArtificial(baseMidi, touchMidi) {
  const iv = touchMidi - baseMidi;
  const spec = ARTIFICIAL_INTERVALS[iv];
  if (!spec) return { interval: iv, valid: false };
  return {
    interval: iv, valid: true, partial: spec.partial,
    intervalName: spec.name, verdict: spec.verdict,
    sounding: baseMidi + PARTIAL_SEMI[spec.partial],
  };
}

/* Pairs artificial harmonics, computes sounding pitch, suppresses the diamond
   so it never registers as an independent voice in vertical rules. */
function resolveHarmonics(score) {
  const groups = new Map();
  for (const n of score.allNotes) {
    if (!n.harmonic) continue;
    const key = `${n.pid}|${n.onsetQ.toFixed(4)}|${n.voice}|${n.staff}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }

  for (const notes of groups.values()) {
    notes.sort((a, b) => a.concertMidi - b.concertMidi);

    // An explicit sounding-pitch note wins outright
    const soundingNote = notes.find(n => n.harmonic.pitchType === "sounding" && n.harmonic.marked);
    if (soundingNote) {
      soundingNote.soundingMidi = soundingNote.concertMidi;
      soundingNote.harmonic.resolved = resolveNaturalFromSounding(soundingNote.concertMidi, soundingNote.instrKey);
      for (const n of notes) if (n !== soundingNote) n.isSuppressed = true;
      continue;
    }

    // Two or more notes at one onset = artificial pair (stopped + diamond)
    if (notes.length >= 2) {
      const base  = notes.find(n => n.harmonic.pitchType === "base") || notes[0];
      const touch = notes.find(n => n.harmonic.pitchType === "touching" && n !== base) || notes[notes.length - 1];
      const res = resolveArtificial(base.concertMidi, touch.concertMidi);
      base.harmonic.kind = "artificial";
      base.harmonic.artificial = res;
      base.harmonic.baseMidi = base.concertMidi;
      base.harmonic.touchMidi = touch.concertMidi;
      base.soundingMidi = res.valid ? res.sounding : null;
      for (const n of notes) if (n !== base) n.isSuppressed = true;
      continue;
    }

    // Single note
    const n = notes[0];
    if (n.harmonic.kind === "artificial") {
      n.harmonic.malformed = true;           // artificial needs a pair
      n.soundingMidi = null;
    } else if (n.harmonic.pitchType === "base") {
      n.harmonic.indeterminate = true;       // open string given, partial unknown
      n.soundingMidi = null;
    } else {
      const res = resolveNaturalFromTouch(n.concertMidi, n.instrKey);
      n.harmonic.kind = "natural";
      n.harmonic.resolved = res;
      n.soundingMidi = res ? res.sounding : null;
      if (!res) n.harmonic.noNode = true;
    }
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   5. SCORE MODEL BUILDER
   ─────────────────────────────────────────────────────────────────────────
   Produces a time-aware representation of the whole score:
     score.parts[]      — each with an ordered note stream
     score.allNotes[]   — flat list across every part
     score.slices[]     — vertical sonorities (what sounds simultaneously)
   Every note carries: onsetQ (absolute position in quarter notes), durQ,
   writtenMidi, concertMidi, voice, staff, clef, tie flags.
   This is what makes vertical + horizontal rules possible.
   ═══════════════════════════════════════════════════════════════════════════ */
function buildScoreModel(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid XML — check your file.");

  // ── Part metadata ──
  const partMeta = {};
  doc.querySelectorAll("score-part").forEach(sp => {
    const id = sp.getAttribute("id");
    const nameEl = sp.querySelector("part-name") || sp.querySelector("instrument-name");
    const raw = nameEl ? nameEl.textContent.trim() : id;
    partMeta[id] = { id, rawName: raw, normalized: resolveInstrument(raw) };
  });

  const titleEl = doc.querySelector("work-title") || doc.querySelector("movement-title");
  const title = titleEl ? titleEl.textContent.trim() : "Untitled Score";

  const parts = [];
  const allNotes = [];
  const measureStarts = {};
  let maxMeasure = 0;

  doc.querySelectorAll("part").forEach(partEl => {
    const pid = partEl.getAttribute("id");
    const meta = partMeta[pid] || { id: pid, rawName: pid, normalized: null };

    let divisions = 1;      // divisions per quarter note
    let transpose = 0;      // chromatic semitones (written → concert)
    let keyFifths = 0;
    const clefByStaff = {};
    let elapsedQ = 0;       // absolute time at start of current measure
    const partNotes = [];

    partEl.querySelectorAll("measure").forEach(measureEl => {
      const mNum = parseInt(measureEl.getAttribute("number")) || 0;
      if (mNum > maxMeasure) maxMeasure = mNum;

      let cursorQ = 0;      // position inside this measure
      let measureLenQ = 0;  // furthest point reached
      let lastOnsetQ = 0;   // for <chord> notes

      // Walk children in document order — required for backup/forward
      Array.from(measureEl.children).forEach(el => {
        const tag = el.tagName;

        if (tag === "attributes") {
          const div = el.querySelector("divisions");
          if (div) divisions = parseInt(div.textContent) || divisions;
          const tr = el.querySelector("transpose");
          if (tr) {
            const chr = tr.querySelector("chromatic");
            const oct = tr.querySelector("octave-change");
            if (chr) transpose = parseInt(chr.textContent) + (oct ? parseInt(oct.textContent) * 12 : 0);
          }
          el.querySelectorAll("clef").forEach(c => {
            const staffNo = c.getAttribute("number") || "1";
            const sign = c.querySelector("sign")?.textContent || "G";
            const line = parseInt(c.querySelector("line")?.textContent || "2");
            const octChange = parseInt(c.querySelector("clef-octave-change")?.textContent || "0");
            clefByStaff[staffNo] = { sign, line, octaveChange: octChange };
          });
          const k = el.querySelector("key fifths");
          if (k) keyFifths = parseInt(k.textContent) || 0;
        }

        else if (tag === "backup") {
          const d = parseInt(el.querySelector("duration")?.textContent || 0);
          cursorQ = Math.max(0, cursorQ - d / divisions);
        }

        else if (tag === "forward") {
          const d = parseInt(el.querySelector("duration")?.textContent || 0);
          cursorQ += d / divisions;
          if (cursorQ > measureLenQ) measureLenQ = cursorQ;
        }

        else if (tag === "note") {
          const isChord = !!el.querySelector("chord");
          const isRest  = !!el.querySelector("rest");
          const isGrace = !!el.querySelector("grace");
          const durEl   = el.querySelector("duration");
          const durQ    = durEl ? parseInt(durEl.textContent) / divisions : 0;
          const voice   = el.querySelector("voice")?.textContent || "1";
          const staff   = el.querySelector("staff")?.textContent || "1";

          // ── Harmonic detection ──
          const harmEl = el.querySelector("harmonic");
          const headEl = el.querySelector("notehead");
          const isDiamond = headEl && /diamond/i.test(headEl.textContent || "");
          let harmonic = null;
          if (harmEl) {
            harmonic = {
              marked: true,
              kind: harmEl.querySelector("artificial") ? "artificial" : "natural",
              pitchType: harmEl.querySelector("sounding-pitch") ? "sounding"
                       : harmEl.querySelector("touching-pitch") ? "touching"
                       : harmEl.querySelector("base-pitch")     ? "base"
                       : "sounding",   // bare <harmonic/>: the circle sits over the sounding pitch
            };
          } else if (isDiamond) {
            harmonic = { marked: false, kind: "natural", pitchType: "touching" };
          }

          // Chord members share the onset of the note they attach to
          const onsetInMeasure = isChord ? lastOnsetQ : cursorQ;

          if (isRest) {
            partNotes.push({
              pid, displayName: meta.rawName, instrKey: meta.normalized,
              measure: mNum, onsetQ: elapsedQ + onsetInMeasure, durQ,
              isRest: true, voice, staff,
            });
          } else {
            const pitch = el.querySelector("pitch");
            if (pitch) {
              const step   = pitch.querySelector("step")?.textContent;
              const octave = pitch.querySelector("octave")?.textContent;
              const alter  = parseFloat(pitch.querySelector("alter")?.textContent || 0);
              if (step && octave) {
                const writtenMidi = pitchToMidi(step, octave, alter);
                const note = {
                  pid, displayName: meta.rawName, instrKey: meta.normalized,
                  measure: mNum,
                  onsetQ: elapsedQ + onsetInMeasure,
                  durQ: isGrace ? 0 : durQ,
                  writtenMidi,
                  concertMidi: writtenMidi + transpose,
                  transpose, keyFifths,
                  voice, staff, isChord, isGrace,
                  tieStart: !!el.querySelector('tie[type="start"]'),
                  tieStop:  !!el.querySelector('tie[type="stop"]'),
                  clef: clefByStaff[staff] || clefByStaff["1"] || null,
                  harmonic, soundingMidi: null, isSuppressed: false,
                };
                partNotes.push(note);
                allNotes.push(note);
              }
            }
          }

          if (!isChord && !isGrace) {
            lastOnsetQ = cursorQ;
            cursorQ += durQ;
            if (cursorQ > measureLenQ) measureLenQ = cursorQ;
          }
        }
      });

      if (measureStarts[mNum] === undefined) measureStarts[mNum] = elapsedQ;
      elapsedQ += measureLenQ;
    });

    parts.push({ ...meta, notes: partNotes });
  });

  const score = { title, parts, partMeta, allNotes, maxMeasure, measureStarts };
  resolveHarmonics(score);
  score.slices = buildSlices(score);
  return score;
}

/* ── Vertical sonorities: what is sounding at each attack point ───────────── */
function buildSlices(score) {
  const pitched = score.allNotes
    .filter(n => !n.isGrace && !n.isSuppressed && n.concertMidi != null)
    .map(n => (n.harmonic && n.soundingMidi != null
      ? { ...n, concertMidi: n.soundingMidi }   // a harmonic sounds where it sounds
      : n));
  if (!pitched.length) return [];

  const onsets = [...new Set(pitched.map(n => Math.round(n.onsetQ * 480)))]
    .sort((a, b) => a - b)
    .map(v => v / 480);

  const slices = [];
  for (const t of onsets) {
    const sounding = pitched.filter(n => n.onsetQ <= t + 1e-6 && n.onsetQ + n.durQ > t + 1e-6);
    if (!sounding.length) continue;
    slices.push({
      onsetQ: t,
      measure: sounding[0].measure,
      notes: sounding,
      pitches: sounding.map(n => n.concertMidi).sort((a, b) => a - b),
    });
  }
  return slices;
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. RULE REGISTRY
   ─────────────────────────────────────────────────────────────────────────
   Each rule is self-contained: it receives the score model and returns an
   array of issues. Adding a new check means adding one object to this array —
   nothing else in the app has to change.

   Issue shape:
     { ruleId, severity, pid, displayName, instrKey, measure, onsetQ,
       direction, concertNote, writtenNote, concertMidi, safeRange, message }
   severity: "error" | "caution"
   ═══════════════════════════════════════════════════════════════════════════ */
const RULES = [
  {
    id: "range",
    name: "Instrument Range",
    tier: 1,
    description: "Notes outside safe playing ranges, with caution buffer zones",
    defaultEnabled: true,
    run: (score) => {
      const issues = [];
      for (const n of score.allNotes) {
        if (!n.instrKey || n.isSuppressed) continue;
        // Harmonics legitimately sound far above the stopped-note ceiling —
        // the harmonics rule owns them and checks feasibility instead.
        if (n.harmonic) continue;
        const r = SAFE_RANGES[n.instrKey];
        if (!r) continue;

        const bufH = r.bufferHigh || 0;
        const bufL = r.bufferLow || 0;
        let direction = null;

        if (n.concertMidi > r.high) {
          direction = bufH > 0 && n.concertMidi <= r.high + bufH ? "HIGH_CAUTION" : "HIGH";
        } else if (n.concertMidi < r.low) {
          direction = bufL > 0 && n.concertMidi >= r.low - bufL ? "LOW_CAUTION" : "LOW";
        }
        if (!direction) continue;

        const isCaution = direction === "HIGH_CAUTION" || direction === "LOW_CAUTION";
        issues.push({
          ruleId: "range",
          severity: isCaution ? "caution" : "error",
          pid: n.pid,
          displayName: n.displayName,
          instrKey: n.instrKey,
          measure: n.measure,
          onsetQ: n.onsetQ,
          concertMidi: n.concertMidi,
          concertNote: midiToNote(n.concertMidi),
          writtenNote: n.transpose !== 0 ? midiToNote(n.writtenMidi) : null,
          direction,
          safeRange: r,
          message: `${midiToNote(n.concertMidi)} is ${
            direction.startsWith("HIGH") ? "above" : "below"
          } the safe range (${midiToNote(r.low)}–${midiToNote(r.high)})`,
        });
      }
      return issues;
    },
  },

  {
    id: "harmonics",
    name: "String Harmonics",
    tier: 1,
    description: "Valid partials, playable touch intervals, reachable stopped notes",
    defaultEnabled: true,
    run: (score) => {
      const issues = [];
      for (const n of score.allNotes) {
        if (!n.harmonic || n.isSuppressed) continue;
        const h = n.harmonic;
        const shown = n.soundingMidi ?? n.concertMidi;

        const push = (severity, message) => issues.push({
          ruleId: "harmonics",
          severity,
          direction: severity === "error" ? "HARMONIC_ERROR" : "HARMONIC_CAUTION",
          pid: n.pid, displayName: n.displayName, instrKey: n.instrKey,
          measure: n.measure, onsetQ: n.onsetQ,
          concertMidi: shown,
          concertNote: midiToNote(shown),
          writtenNote: null,
          safeRange: null,
          message,
        });

        // Harmonic notation on something that isn't a bowed string
        if (!STRING_DATA[n.instrKey]) {
          push("error", `Harmonic marked on ${n.instrKey || "an unrecognized part"} — string harmonic notation does not apply here`);
          continue;
        }
        const data = STRING_DATA[n.instrKey];

        // Diamond notehead with no harmonic marking
        if (!h.marked) {
          push("caution", "Diamond notehead with no harmonic marking — add a proper harmonic indication so parts and playback read correctly");
        }

        // ── Artificial ──
        if (h.kind === "artificial") {
          if (h.malformed) {
            push("error", "Artificial harmonic needs both a stopped note and a touch note written as a chord");
            continue;
          }
          const a = h.artificial;
          if (!a || !a.valid) {
            push("error", `Touch interval of ${a ? a.interval : "?"} semitones is not a harmonic node — use a perfect 4th above the stopped note`);
            continue;
          }
          if (a.verdict === "error") {
            push("error", `${a.intervalName} touch (${a.partial}th partial) is impractical — rewrite as a perfect 4th, sounding ${midiToNote(a.sounding)}`);
          } else if (a.verdict === "caution") {
            push("caution", `${a.intervalName} touch (${a.partial}rd partial) needs a wide stretch — a perfect 4th is safer`);
          }
          if (h.baseMidi > data.maxStopped) {
            push("caution", `Stopped note ${midiToNote(h.baseMidi)} is above ${midiToNote(data.maxStopped)} — the hand cannot hold a 4th that high`);
          }
          continue;
        }

        // ── Natural ──
        if (h.indeterminate) {
          push("caution", "Natural harmonic written at the open string — notate the touch point or the sounding pitch so the partial is unambiguous");
          continue;
        }
        if (h.noNode) {
          push("error", `${midiToNote(n.concertMidi)} is not a harmonic node on any open string of the ${n.instrKey.toLowerCase()}`);
          continue;
        }
        const res = h.resolved;
        if (!res) {
          push("error", `${midiToNote(n.concertMidi)} is not available as a natural harmonic on the ${n.instrKey.toLowerCase()}`);
          continue;
        }
        if (res.partial > RELIABLE_PARTIAL_MAX) {
          const cents = PARTIAL_CENTS[res.partial];
          push("caution", `${res.partial}th partial of the ${midiToNote(res.open)} string — ${Math.abs(cents)} cents ${cents < 0 ? "flat" : "sharp"}, unreliable in tune`);
        }
      }
      return issues;
    },
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   7. ANALYSIS PIPELINE
   ═══════════════════════════════════════════════════════════════════════════ */
function analyzeScore(xmlText, enabledRuleIds = null) {
  const score = buildScoreModel(xmlText);

  const issues = [];
  for (const rule of RULES) {
    if (enabledRuleIds && !enabledRuleIds.includes(rule.id)) continue;
    try {
      issues.push(...rule.run(score));
    } catch (e) {
      console.error(`Rule "${rule.id}" failed:`, e);
    }
  }

  issues.sort(
    (a, b) => a.measure - b.measure || a.displayName.localeCompare(b.displayName)
  );

  // Per-part statistics
  const partStats = {};
  for (const p of score.parts) {
    partStats[p.id] = {
      rawName: p.rawName,
      normalized: p.normalized,
      total: p.notes.filter(n => !n.isRest && !n.isSuppressed).length,
      vCount: 0,
      cautionCount: 0,
      outOfRangeCount: 0,
    };
  }
  for (const i of issues) {
    const s = partStats[i.pid];
    if (!s) continue;
    s.vCount++;
    if (i.severity === "caution") s.cautionCount++;
    else s.outOfRangeCount++;
  }

  return {
    title: score.title,
    violations: issues,
    partStats,
    maxMeasure: score.maxMeasure,
    partMeta: score.partMeta,
    score,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. UI
   ═══════════════════════════════════════════════════════════════════════════ */
const COLORS = {
  bg: "#0D0D0D",
  surface: "#181818",
  card: "#1E1E1E",
  border: "#2A2A2A",
  red: "#C8102E",
  redDim: "rgba(200,16,46,0.15)",
  blue: "#2563EB",
  blueDim: "rgba(37,99,235,0.15)",
  gold: "#F5C842",
  amber: "#F59E0B",
  amberDim: "rgba(245,158,11,0.15)",
  text: "#F0EDEA",
  muted: "#888",
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
  @keyframes spin { to { transform: rotate(360deg); } }
  .fade-up { animation: fadeUp .45s ease both; }
  .fade-up-1 { animation: fadeUp .45s .08s ease both; }
  .fade-up-2 { animation: fadeUp .45s .16s ease both; }
  .fade-up-3 { animation: fadeUp .45s .24s ease both; }
`;

export default function App() {
  const [state, setState] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedMeasure, setExpandedMeasure] = useState(null);
  const [enabledRules, setEnabledRules] = useState(
    RULES.filter(r => r.defaultEnabled).map(r => r.id)
  );
  const fileRef = useRef();

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      const name = file.name.toLowerCase();
      if (!name.endsWith(".xml") && !name.endsWith(".musicxml") && !name.endsWith(".mxl")) {
        setError("Please upload a MusicXML file (.xml, .musicxml, or .mxl).");
        setState("error");
        return;
      }
      setState("loading");
      try {
        const text = name.endsWith(".mxl") ? await extractMxl(file) : await file.text();
        setResult(analyzeScore(text, enabledRules));
        setState("result");
      } catch (e) {
        setError(e.message || "Could not parse file.");
        setState("error");
      }
    },
    [enabledRules]
  );

  const onDrop = useCallback((e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }, [handleFile]);
  const onDragOver = useCallback((e) => e.preventDefault(), []);

  const toggleRule = (id) =>
    setEnabledRules(prev => (prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]));

  // ── Derived ──
  const filtered = result
    ? result.violations.filter(v =>
        filter === "all" ? true
        : filter === "CAUTION" ? v.severity === "caution"
        : filter === "OUT_OF_RANGE" ? v.severity === "error"
        : filter.startsWith("rule:") ? v.ruleId === filter.slice(5)
        : v.instrKey === filter
      )
    : [];

  const uniqueInstruments = result
    ? [...new Set(result.violations.map(v => v.instrKey).filter(Boolean))]
        .sort((a, b) => SCORE_ORDER.indexOf(a) - SCORE_ORDER.indexOf(b))
    : [];

  const activeRuleIds = result
    ? RULES.map(r => r.id).filter(id => result.violations.some(v => v.ruleId === id))
    : [];
  const heatmap = result ? buildHeatmap(result) : null;
  const totalFlagged    = result ? result.violations.length : 0;
  const totalCaution    = result ? result.violations.filter(v => v.severity === "caution").length : 0;
  const totalOutOfRange = result ? result.violations.filter(v => v.severity === "error").length : 0;
  const affectedParts    = result ? new Set(result.violations.map(v => v.pid)).size : 0;
  const affectedMeasures = result ? new Set(result.violations.map(v => v.measure)).size : 0;

  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: "100vh", background: COLORS.bg }}>

        {/* ── HEADER ── */}
        <header style={{ borderBottom: `1px solid ${COLORS.border}`, background: `linear-gradient(180deg,#100508 0%,${COLORS.bg} 100%)`, padding: "0 32px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: COLORS.red, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎼</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, letterSpacing: ".01em" }}>
                Instrument Range Checker
              </div>
            </div>
            {result && (
              <button
                onClick={() => { setState("idle"); setResult(null); setFilter("all"); }}
                style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.muted, padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}
              >
                ← New Score
              </button>
            )}
          </div>
        </header>

        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 80px" }}>

          {/* ── IDLE ── */}
          {state === "idle" && (
            <div className="fade-up" style={{ maxWidth: 640, margin: "60px auto 0" }}>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
                Instrument Range Checker
              </h1>
              <p style={{ textAlign: "center", color: COLORS.muted, fontSize: 15, marginBottom: 40 }}>
                Upload your MusicXML score and instantly see every note that falls outside the safe ranges.
              </p>

              <div
                onDrop={onDrop} onDragOver={onDragOver}
                onClick={() => fileRef.current.click()}
                style={{ border: `2px dashed ${COLORS.border}`, borderRadius: 16, padding: "56px 32px", textAlign: "center", cursor: "pointer", background: COLORS.surface, transition: "all .2s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.red; e.currentTarget.style.background = COLORS.redDim; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.background = COLORS.surface; }}
              >
                <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
                <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Drop your score here</div>
                <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 20 }}>or click to browse</div>
                <div style={{ display: "inline-block", background: COLORS.red, color: "#fff", padding: "10px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600 }}>
                  Choose MusicXML File
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 16 }}>
                  Accepts .xml · .musicxml · .mxl &nbsp;|&nbsp; Export from Sibelius, Finale, MuseScore, Dorico
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".xml,.musicxml,.mxl" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />

              {/* Active checks — the rule registry, exposed */}
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: COLORS.muted, marginBottom: 10 }}>
                  Active Checks
                </div>
                {RULES.map(r => {
                  const on = enabledRules.includes(r.id);
                  return (
                    <div key={r.id} onClick={() => toggleRule(r.id)}
                      style={{ display: "flex", alignItems: "center", gap: 12, background: COLORS.card, border: `1px solid ${on ? COLORS.red : COLORS.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 6, cursor: "pointer" }}>
                      <div style={{ width: 32, height: 18, borderRadius: 9, background: on ? COLORS.red : "#333", position: "relative", flexShrink: 0, transition: "background .2s" }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: on ? 16 : 2, transition: "left .2s" }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: COLORS.muted }}>{r.description}</div>
                      </div>
                      <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: "1px 6px" }}>
                        Tier {r.tier}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Range reference */}
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: COLORS.muted, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <span>Safe Range Reference (Concert Pitch)</span>
                  <span style={{ textTransform: "none", letterSpacing: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: COLORS.muted, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: "1px 6px" }}>Middle C = C4</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                  {Object.entries(SAFE_RANGES).map(([name, r]) => (
                    <div key={name} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13 }}>{name}</span>
                      <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: COLORS.gold }}>
                        {midiToNote(r.low)}–{midiToNote(r.high)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── LOADING ── */}
          {state === "loading" && (
            <div style={{ textAlign: "center", padding: "100px 0" }}>
              <div style={{ width: 40, height: 40, border: `3px solid ${COLORS.border}`, borderTopColor: COLORS.red, borderRadius: "50%", margin: "0 auto 20px", animation: "spin 1s linear infinite" }} />
              <div style={{ color: COLORS.muted }}>Analyzing score…</div>
            </div>
          )}

          {/* ── ERROR ── */}
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

          {/* ── RESULTS ── */}
          {state === "result" && result && (
            <div>
              <div className="fade-up" style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: COLORS.muted, marginBottom: 4 }}>Analyzing</div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700 }}>{result.title}</h2>
                <div style={{ fontSize: 11, color: "#555", marginTop: 6, fontFamily: "'JetBrains Mono',monospace" }}>
                  {result.score.parts.length} parts · {result.score.allNotes.length} notes · {result.score.slices.length} vertical sonorities analyzed
                </div>
              </div>

              {/* Stats */}
              <div className="fade-up-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
                <StatCard label="Out of Range" value={totalOutOfRange} sub="notes to rewrite" color={totalOutOfRange > 0 ? COLORS.red : COLORS.success} border={totalOutOfRange > 0 ? COLORS.red : COLORS.border} />
                <StatCard label="Caution Zone" value={totalCaution} sub="notes to review" color={totalCaution > 0 ? COLORS.amber : COLORS.success} border={totalCaution > 0 ? COLORS.amber : COLORS.border} />
                <StatCard label="Parts Flagged" value={affectedParts} sub={`of ${Object.keys(result.partStats).length} parts`} color={COLORS.gold} border={COLORS.border} />
                <StatCard label="Measures Flagged" value={affectedMeasures} sub={`of ${result.maxMeasure} total`} color="#A78BFA" border={COLORS.border} />
              </div>

              {totalFlagged === 0 ? (
                <div className="fade-up-2" style={{ textAlign: "center", padding: "60px 32px", background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.25)", borderRadius: 16 }}>
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

                  {/* Part cards */}
                  <div className="fade-up-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 24 }}>
                    {Object.entries(result.partStats)
                      .filter(([, s]) => s.vCount > 0)
                      .sort(([, a], [, b]) => b.vCount - a.vCount)
                      .map(([pid, s]) => (
                        <PartCard key={pid} s={s} active={filter === s.normalized}
                          onClick={() => setFilter(f => (f === s.normalized ? "all" : s.normalized))} />
                      ))}
                  </div>

                  {/* Filters */}
                  <div className="fade-up-3" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: COLORS.muted, marginRight: 4 }}>Filter:</span>
                    <FilterChip label="All Notes to Review" active={filter === "all"} onClick={() => setFilter("all")} />
                    <FilterChip label="🔴 Needs Fixing" active={filter === "OUT_OF_RANGE"} onClick={() => setFilter("OUT_OF_RANGE")} color="red" />
                    <FilterChip label="🟡 Caution" active={filter === "CAUTION"} onClick={() => setFilter("CAUTION")} color="amber" />
                    {activeRuleIds.length > 1 && activeRuleIds.map(rid => (
                      <FilterChip key={rid} label={RULES.find(r => r.id === rid)?.name || rid}
                        active={filter === `rule:${rid}`} onClick={() => setFilter(`rule:${rid}`)} />
                    ))}
                    {uniqueInstruments.map(f => (
                      <FilterChip key={f} label={f} active={filter === f} onClick={() => setFilter(f)} />
                    ))}
                    {filter !== "all" && <span style={{ fontSize: 12, color: COLORS.muted }}>{filtered.length} shown</span>}
                  </div>

                  {/* Table */}
                  <div className="fade-up-3" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Notes to Review</div>
                      <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'JetBrains Mono',monospace" }}>
                        {filtered.length} note{filtered.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "72px 150px 110px 136px 1fr", padding: "8px 20px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: COLORS.muted }}>
                      <span>Measure</span><span>Instrument</span><span>Sounds</span><span>Status</span><span>Detail</span>
                    </div>
                    <div style={{ maxHeight: 480, overflowY: "auto" }}>
                      {filtered.length === 0
                        ? <div style={{ textAlign: "center", padding: 40, color: COLORS.muted }}>No notes match this filter.</div>
                        : filtered.map((v, i) => <ViolationRow key={i} v={v} i={i} />)}
                    </div>
                  </div>

                  {/* Reference */}
                  <div style={{ marginTop: 24 }}>
                    <div className="fade-up-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: COLORS.muted, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                      <span>Safe Ranges Reference</span>
                      <span style={{ textTransform: "none", letterSpacing: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: COLORS.muted, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: "1px 6px" }}>Middle C = C4</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                      {Object.entries(SAFE_RANGES).map(([name, r]) => {
                        const rangeIssues = result.violations.filter(v => v.instrKey === name && v.ruleId === "range");
                        const hasHigh    = rangeIssues.some(v => v.direction === "HIGH");
                        const hasLow     = rangeIssues.some(v => v.direction === "LOW");
                        const hasCaution = rangeIssues.some(v => v.severity === "caution");
                        const borderCol = hasHigh ? COLORS.red : hasLow ? COLORS.blue : hasCaution ? COLORS.amber : COLORS.border;
                        const bgCol     = hasHigh ? COLORS.redDim : hasLow ? COLORS.blueDim : hasCaution ? COLORS.amberDim : COLORS.card;
                        const noteCol   = hasHigh ? COLORS.red : hasLow ? COLORS.blue : hasCaution ? COLORS.amber : COLORS.gold;
                        return (
                          <div key={name} style={{ background: bgCol, border: `1px solid ${borderCol}`, borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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

/* ═══════════════════════════════════════════════════════════════════════════
   9. SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */
function StatCard({ label, value, sub, color, border }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${border}`, borderRadius: 12, padding: "16px 20px" }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: COLORS.muted, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function ViolationRow({ v, i }) {
  const d = v.direction;
  const isCaution = v.severity === "caution";
  const isLow     = d === "LOW";
  const isHarm    = d === "HARMONIC_ERROR" || d === "HARMONIC_CAUTION";

  const color  = isCaution ? COLORS.amber : isLow ? COLORS.blue : COLORS.red;
  const bg     = isCaution ? COLORS.amberDim : isLow ? COLORS.blueDim : COLORS.redDim;
  const label  = d === "HIGH_CAUTION" ? "🟡 High Caution"
               : d === "LOW_CAUTION"  ? "🟡 Low Caution"
               : d === "HIGH"         ? "🔴 Too High"
               : d === "LOW"          ? "🔴 Too Low"
               : d === "HARMONIC_CAUTION" ? "🟡 Harmonic"
               :                            "🔴 Harmonic";

  const detail = v.message
    || (v.safeRange ? `Safe range ${midiToNote(v.safeRange.low)}–${midiToNote(v.safeRange.high)}` : "");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px 150px 110px 136px 1fr", padding: "10px 20px", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.02)", borderBottom: `1px solid ${COLORS.border}`, alignItems: "center", fontSize: 13, gap: 4 }}>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", color: COLORS.gold, fontWeight: 600 }}>m.{v.measure}</span>
      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.displayName}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color }}>
        {v.concertNote}
        {v.writtenNote && <span style={{ fontSize: 10, color: COLORS.muted, fontWeight: 400 }}> (wr:{v.writtenNote})</span>}
        {isHarm && <span style={{ fontSize: 9, color: COLORS.muted, fontWeight: 400 }}> ◆</span>}
      </span>
      <span>
        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color, border: `1px solid ${color}`, whiteSpace: "nowrap" }}>
          {label}
        </span>
      </span>
      <span style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.4 }}>{detail}</span>
    </div>
  );
}

function FilterChip({ label, active, onClick, color = "default" }) {
  const activeColor = color === "red" ? COLORS.red : color === "amber" ? COLORS.amber : color === "blue" ? "#2563EB" : COLORS.red;
  return (
    <button onClick={onClick} style={{ background: active ? activeColor : COLORS.card, border: `1px solid ${active ? activeColor : COLORS.border}`, color: active ? "#fff" : COLORS.text, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif", fontWeight: 500, transition: "all .15s" }}>
      {label}
    </button>
  );
}

function PartCard({ s, onClick, active }) {
  const dangerPct  = s.total > 0 ? Math.round((s.outOfRangeCount / s.total) * 100) : 0;
  const cautionPct = s.total > 0 ? Math.round((s.cautionCount / s.total) * 100) : 0;
  const borderColor = active ? (s.outOfRangeCount > 0 ? COLORS.red : COLORS.amber) : COLORS.border;
  const bgColor     = active ? (s.outOfRangeCount > 0 ? COLORS.redDim : COLORS.amberDim) : COLORS.card;
  return (
    <button onClick={onClick} style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", textAlign: "left", transition: "all .15s", fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 6 }}>{s.rawName}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1, height: 6, background: "#333", borderRadius: 3, overflow: "hidden", display: "flex" }}>
          <div style={{ width: `${Math.min(dangerPct, 100)}%`, height: "100%", background: COLORS.red }} />
          <div style={{ width: `${Math.min(cautionPct, 100 - dangerPct)}%`, height: "100%", background: COLORS.amber }} />
        </div>
        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: s.outOfRangeCount > 0 ? COLORS.red : COLORS.amber, fontWeight: 700 }}>{s.vCount}</span>
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
        {s.outOfRangeCount > 0 && <span style={{ color: COLORS.red }}>🔴 {s.outOfRangeCount} out of range</span>}
        {s.cautionCount > 0 && <span style={{ color: COLORS.amber }}>🟡 {s.cautionCount} caution</span>}
      </div>
    </button>
  );
}

function buildHeatmap(result) {
  const map = {};
  result.violations.forEach(v => {
    if (!map[v.pid]) map[v.pid] = {};
    if (!map[v.pid][v.measure]) map[v.pid][v.measure] = { high: 0, low: 0, caution: 0 };
    if (v.severity === "caution") map[v.pid][v.measure].caution++;
    else if (v.direction === "LOW") map[v.pid][v.measure].low++;
    else map[v.pid][v.measure].high++;
  });
  return map;
}

function ScoreHeatmap({ heatmap, result, onSelectMeasure, selectedMeasure }) {
  if (!heatmap || !result) return null;
  const parts = Object.entries(result.partStats).filter(([, s]) => s.vCount > 0);
  const measures = result.maxMeasure;
  const CELL = 14, LABEL_W = 140;
  const maxShow = Math.min(measures, 100);
  const measureNums = Array.from({ length: maxShow }, (_, i) => i + 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", marginLeft: LABEL_W, marginBottom: 4 }}>
        {measureNums.map(m => (
          <div key={m} style={{ width: CELL, flexShrink: 0, textAlign: "center", fontSize: 8, color: m % 5 === 0 ? COLORS.muted : "transparent", fontFamily: "'JetBrains Mono',monospace" }}>{m}</div>
        ))}
      </div>
      {parts.map(([pid, s]) => {
        const rowData = heatmap[pid] || {};
        return (
          <div key={pid} style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
            <div style={{ width: LABEL_W, flexShrink: 0, fontSize: 11, color: COLORS.text, paddingRight: 10, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.rawName}</div>
            {measureNums.map(m => {
              const cell = rowData[m] || { high: 0, low: 0, caution: 0 };
              const total = cell.high + cell.low + cell.caution;
              const isSelected = selectedMeasure === m;
              const bg = total === 0 ? "#222"
                : cell.high > 0 ? `rgba(200,16,46,${0.4 + Math.min(cell.high / 4, 1) * 0.6})`
                : cell.low > 0 ? `rgba(37,99,235,${0.4 + Math.min(cell.low / 4, 1) * 0.6})`
                : `rgba(245,158,11,${0.4 + Math.min(cell.caution / 4, 1) * 0.6})`;
              const parts2 = [
                cell.high > 0 ? `${cell.high} needs fixing` : "",
                cell.low > 0 ? `${cell.low} too low` : "",
                cell.caution > 0 ? `${cell.caution} caution` : "",
              ].filter(Boolean);
              return (
                <div key={m}
                  onClick={() => total > 0 && onSelectMeasure(isSelected ? null : m)}
                  title={total === 0 ? `m.${m}: OK` : `m.${m}: ${parts2.join(" · ")}`}
                  style={{ width: CELL, height: CELL, flexShrink: 0, background: bg, border: isSelected ? `1px solid ${COLORS.gold}` : "1px solid transparent", borderRadius: 2, cursor: total > 0 ? "pointer" : "default" }}
                />
              );
            })}
          </div>
        );
      })}
      {measures > maxShow && (
        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 8, marginLeft: LABEL_W }}>
          Showing first {maxShow} of {measures} measures. Later measures still appear in the table below.
        </div>
      )}
      <div style={{ display: "flex", gap: 16, marginTop: 12, marginLeft: LABEL_W, alignItems: "center", flexWrap: "wrap" }}>
        {[["#222", "No issues", COLORS.muted], [COLORS.amber, "Caution", COLORS.amber], [COLORS.blue, "Too Low", COLORS.blue], [COLORS.red, "Needs fixing", COLORS.red]].map(([bg, label, col]) => (
          <div key={label} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <div style={{ width: 12, height: 12, background: bg, borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: col }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

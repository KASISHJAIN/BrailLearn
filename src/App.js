import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./App.css";
import TypingGame from "./TypingGame";

/* ─── BRAILLE DATA ────────────────────────────────────────── */
const LETTER_PATTERNS = {
  A:[true,false,false,false,false,false],  B:[true,true,false,false,false,false],
  C:[true,false,false,true,false,false],   D:[true,false,false,true,true,false],
  E:[true,false,false,false,true,false],   F:[true,true,false,true,false,false],
  G:[true,true,false,true,true,false],     H:[true,true,false,false,true,false],
  I:[false,true,false,true,false,false],   J:[false,true,false,true,true,false],
  K:[true,false,true,false,false,false],   L:[true,true,true,false,false,false],
  M:[true,false,true,true,false,false],    N:[true,false,true,true,true,false],
  O:[true,false,true,false,true,false],    P:[true,true,true,true,false,false],
  Q:[true,true,true,true,true,false],      R:[true,true,true,false,true,false],
  S:[false,true,true,true,false,false],    T:[false,true,true,true,true,false],
  U:[true,false,true,false,false,true],    V:[true,true,true,false,false,true],
  W:[false,true,false,true,true,true],     X:[true,false,true,true,false,true],
  Y:[true,false,true,true,true,true],      Z:[true,false,true,false,true,true],
};
const LETTERS = Object.keys(LETTER_PATTERNS);

/* finger colours for chart lines */
const FINGER_COLORS = ["#5b84c4","#3aad6e","#e06c3e","#a050c8","#d4a020","#4ab8d0"];
const FINGER_NAMES = ["L-Thumb","L-Middle","L-Ring","R-Thumb","R-Middle","R-Ring"];

const DEFAULT_FINGERS = {
  left:  { thumb:false, middle:false, ring:false },
  right: { thumb:false, middle:false, ring:false },
};
const DEFAULT_SETTINGS = {
  textSize: 56, audioEnabled: true, audioSpeed:"normal",
  darkMode: false, highContrast: false, spokenConfirmations: true,
};

/* ─── MAIN APP ────────────────────────────────────────────── */
export default function App() {
  const [activeTab,          setActiveTab]          = useState("Home");
  const [sidebarCollapsed,   setSidebarCollapsed]   = useState(false);

  const [text,               setText]               = useState("");
  const [brailleDots,        setBrailleDots]        = useState(Array(6).fill(false));
  const [fingers,            setFingers]            = useState(DEFAULT_FINGERS);

  const [notes,              setNotes]              = useState([]);
  const [deletedNotes,       setDeletedNotes]       = useState([]);
  const [editingId,          setEditingId]          = useState(null);
  const [editText,           setEditText]           = useState("");
  const [noteSearch,         setNoteSearch]         = useState("");
  const [noteSort,           setNoteSort]           = useState("newest");

  const [connected,          setConnected]          = useState(false);
  const [showSettings,       setShowSettings]       = useState(false);
  const settingsContainerRef = useRef(null);

  const [settings,           setSettings]           = useState(DEFAULT_SETTINGS);

  const [learnMode,          setLearnMode]          = useState("practice");
  const [targetLetter,       setTargetLetter]       = useState("A");
  const [detectedLetter,     setDetectedLetter]     = useState("");
  const [learnMessage,       setLearnMessage]       = useState("Waiting for glove input.");
  const [learnCorrect,       setLearnCorrect]       = useState(null);
  const [completedLetters,   setCompletedLetters]   = useState([]);
  const [lastSpokenMessage,  setLastSpokenMessage]  = useState("");

  const [history,            setHistory]            = useState({ notes:[], practice:[], sessions:[] });

  /* ─ Sensor Data state ─ */
  const [sensorValues,       setSensorValues]       = useState(Array(6).fill(0));
  const [sensorAdcValues,    setSensorAdcValues]    = useState(Array(6).fill(0));
  const [sensorHistory,      setSensorHistory]      = useState(() => Array(6).fill(null).map(() => []));
  const [lastPacketTime,     setLastPacketTime]     = useState(null);
  const [wsLatency,          setWsLatency]          = useState(null);
  const [showAdvanced,       setShowAdvanced]       = useState(false);
  const HISTORY_LEN = 60;

  /* ─ nav ─ */
  const navItems = useMemo(() => [
    { label:"Home",        icon:<HomeIcon /> },
    { label:"Learn",       icon:<LearnIcon /> },
    { label:"Notes",       icon:<NotesIcon /> },
    { label:"History",     icon:<HistoryIcon /> },
    { label:"Sensor Data", icon:<SensorIcon /> },
    { label:"About",       icon:<InfoIcon /> },
  ], []);

  /* ─── localStorage ───────────────────────────────────────── */
  useEffect(() => {
    const load = (key, def) => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; } };
    setNotes(load("braille-notes", []));
    setDeletedNotes(load("braille-deleted-notes", []));
    setSettings({ ...DEFAULT_SETTINGS, ...load("braille-settings", {}) });
    const prog = load("braille-learn-progress", {});
    setCompletedLetters(prog.completedLetters || []);
    setHistory(load("braille-history", { notes:[], practice:[], sessions:[] }));
  }, []);

  useEffect(() => { localStorage.setItem("braille-notes", JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem("braille-deleted-notes", JSON.stringify(deletedNotes)); }, [deletedNotes]);
  useEffect(() => { localStorage.setItem("braille-settings", JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem("braille-learn-progress", JSON.stringify({ completedLetters })); }, [completedLetters]);
  useEffect(() => { localStorage.setItem("braille-history", JSON.stringify(history)); }, [history]);

  /* ─── outside click for settings ────────────────────────── */
  useEffect(() => {
    const fn = e => { if (settingsContainerRef.current && !settingsContainerRef.current.contains(e.target)) setShowSettings(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  /* ─── TTS ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!settings.audioEnabled || !settings.spokenConfirmations || !lastSpokenMessage) return;
    speakText(lastSpokenMessage, settings.audioSpeed);
  }, [lastSpokenMessage, settings.audioEnabled, settings.audioSpeed, settings.spokenConfirmations]);

  /* ─── WebSocket ──────────────────────────────────────────── */
  const learnRef = useRef({ learnMode, targetLetter, completedLetters, activeTab, settings });
  useEffect(() => { learnRef.current = { learnMode, targetLetter, completedLetters, activeTab, settings }; },
    [learnMode, targetLetter, completedLetters, activeTab, settings]);

  useEffect(() => {
    let ws;
    const pingInterval = { id: null };
    const pingTimes = {};
    let pingCounter = 0;

    try {
      ws = new WebSocket("ws://localhost:5001");

      ws.addEventListener("open", () => {
        setConnected(true);
        // start pinging for latency
        pingInterval.id = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const id = ++pingCounter;
            pingTimes[id] = performance.now();
            ws.send(JSON.stringify({ type: "ping", id }));
          }
        }, 2000);
      });

      ws.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "pong" && pingTimes[data.id]) {
            setWsLatency(Math.round(performance.now() - pingTimes[data.id]));
            delete pingTimes[data.id];
            return;
          }

          if (data.type === "status") { setConnected(!!data.connected); return; }

          if (data.type === "sensor" && Array.isArray(data.values)) {
            const vals = data.values.slice(0, 6);
            const adcVals = data.adc || vals.map(v => Math.round(v * 40.95));
            setSensorValues(vals);
            setSensorAdcValues(adcVals);
            setLastPacketTime(Date.now());
            setSensorHistory(prev => prev.map((h, i) => {
              const next = [...h, vals[i] ?? 0];
              return next.length > HISTORY_LEN ? next.slice(-HISTORY_LEN) : next;
            }));
            return;
          }

          if (data.type === "letter" && data.letter) {
            handleIncomingLetter(String(data.letter).toUpperCase()); return;
          }

          if (data.type === "pattern" && Array.isArray(data.pattern) && data.pattern.length === 6) {
            handleIncomingPattern(data.pattern); return;
          }
        } catch (err) { console.error("Bad ws message:", err); }
      });

      ws.addEventListener("close", () => { setConnected(false); clearInterval(pingInterval.id); });
      ws.addEventListener("error", () => { setConnected(false); clearInterval(pingInterval.id); });
    } catch { setConnected(false); }

    return () => { clearInterval(pingInterval.id); if (ws) try { ws.close(); } catch {} };
  // eslint-disable-next-line
  }, []);

  /* ─── helpers ────────────────────────────────────────────── */
  const { darkMode, textSize, audioEnabled, audioSpeed } = settings;

  const filteredNotes = useMemo(() => {
    let r = [...notes];
    if (noteSearch) r = r.filter(n => n.text.toLowerCase().includes(noteSearch.toLowerCase()));
    if (noteSort === "oldest")   r.sort((a,b) => a.id - b.id);
    else if (noteSort === "longest")  r.sort((a,b) => b.text.length - a.text.length);
    else if (noteSort === "shortest") r.sort((a,b) => a.text.length - b.text.length);
    else r.sort((a,b) => b.id - a.id);
    return r;
  }, [notes, noteSearch, noteSort]);

  function speakText(msg, speed="normal") {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(msg);
    u.rate = speed === "slow" ? 0.8 : speed === "fast" ? 1.25 : 1;
    window.speechSynthesis.speak(u);
  }

  function resetVisuals() {
    setBrailleDots(Array(6).fill(false));
    setFingers(DEFAULT_FINGERS);
  }

  function applyPatternToHands(pattern) {
    setFingers({
      left:  { ring:pattern[0], middle:pattern[1], thumb:pattern[2] },
      right: { ring:pattern[3], middle:pattern[4], thumb:pattern[5] },
    });
  }

  function getLetterFromPattern(pattern) {
    for (const [letter, val] of Object.entries(LETTER_PATTERNS)) {
      if (JSON.stringify(val) === JSON.stringify(pattern)) return letter;
    }
    return null;
  }

  function handleLetterInput(letter) {
    const pattern = LETTER_PATTERNS[letter];
    if (!pattern) return;
    setText(p => p + letter);
    setDetectedLetter(letter);
    setBrailleDots(pattern);
    applyPatternToHands(pattern);
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage(`Entered ${letter}`);
  }

  function handleIncomingPattern(pattern) {
    const detected = getLetterFromPattern(pattern);
    setBrailleDots(pattern);
    applyPatternToHands(pattern);
    if (detected) handleIncomingLetter(detected, pattern);
    else {
      setDetectedLetter("?");
      setLearnCorrect(false);
      setLearnMessage("Pattern received, but it does not match a supported letter.");
    }
  }

  function handleIncomingLetter(letter, incomingPattern) {
    const { learnMode, targetLetter, completedLetters, activeTab, settings } = learnRef.current;
    const pattern = incomingPattern || LETTER_PATTERNS[letter];
    if (!pattern) return;

    setDetectedLetter(letter);
    setBrailleDots(pattern);
    applyPatternToHands(pattern);

    if (activeTab === "Home") {
      setText(p => p + letter);
      if (settings.spokenConfirmations && settings.audioEnabled) setLastSpokenMessage(`Entered ${letter}`);
      return;
    }

    if (activeTab === "Learn") {
      if (learnMode === "practice") {
        const ok = letter === targetLetter;
        setLearnCorrect(ok);
        setLearnMessage(ok ? `Correct! You entered ${letter}.` : `Not quite — you entered ${letter}, target is ${targetLetter}.`);
        if (ok && !completedLetters.includes(letter)) setCompletedLetters(p => [...p, letter]);
        setHistory(p => ({
          ...p,
          practice: [{ type: ok?"correct":"incorrect", letter, target:targetLetter, createdAt:new Date().toLocaleString() }, ...p.practice].slice(0, 100),
        }));
        if (settings.spokenConfirmations && settings.audioEnabled) setLastSpokenMessage(ok ? `Correct. ${letter}` : `Incorrect. You entered ${letter}`);
      } else {
        setLearnCorrect(null);
        setLearnMessage(`Explore mode — detected ${letter}.`);
        if (settings.spokenConfirmations && settings.audioEnabled) setLastSpokenMessage(`Detected ${letter}`);
      }
    }
  }

  function handleBackspace() { setText(p => p.slice(0, -1)); if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Backspace"); }
  function handleClear() { setText(""); setDetectedLetter(""); resetVisuals(); if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Cleared"); }

  function handleSaveNote() {
    if (!text.trim()) return;
    const n = { id:Date.now(), text:text.trim(), createdAt:new Date().toLocaleString() };
    setNotes(p => [n, ...p]);
    setHistory(p => ({ ...p, notes:[{ type:"note", text:text.trim().slice(0,50), createdAt:new Date().toLocaleString() }, ...p.notes].slice(0,50) }));
    setText(""); setDetectedLetter(""); resetVisuals();
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Note saved");
  }

  function exportNoteAsTxt() {
    if (!text.trim()) return;
    const a = Object.assign(document.createElement("a"), { href:URL.createObjectURL(new Blob([text],{type:"text/plain"})), download:"braille-note.txt" });
    a.click(); URL.revokeObjectURL(a.href);
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Note exported");
  }

  function startEditingNote(note) { setEditingId(note.id); setEditText(note.text); }
  function saveEditedNote() {
    if (!editText.trim()) return;
    setNotes(p => p.map(n => n.id === editingId ? { ...n, text:editText.trim() } : n));
    setEditingId(null); setEditText("");
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Note updated");
  }
  function cancelEditing() { setEditingId(null); setEditText(""); }
  function deleteNote(id) {
    const note = notes.find(n => n.id === id);
    if (note) setDeletedNotes(p => [{ ...note, deletedAt:new Date().toLocaleString() }, ...p]);
    setNotes(p => p.filter(n => n.id !== id));
    if (editingId === id) cancelEditing();
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Note moved to trash");
  }
  function restoreNote(id) {
    const note = deletedNotes.find(n => n.id === id);
    if (note) { const { deletedAt, ...rest } = note; setNotes(p => [rest, ...p]); }
    setDeletedNotes(p => p.filter(n => n.id !== id));
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Note restored");
  }
  function permanentlyDeleteNote(id) {
    setDeletedNotes(p => p.filter(n => n.id !== id));
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Note permanently deleted");
  }
  function emptyTrash() { setDeletedNotes([]); if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Trash emptied"); }

  function nextTargetLetter() {
    const next = LETTERS[(LETTERS.indexOf(targetLetter) + 1) % LETTERS.length];
    setTargetLetter(next); setLearnCorrect(null); setLearnMessage(`New target: ${next}`); setDetectedLetter(""); resetVisuals();
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage(`New target letter ${next}`);
  }
  function randomTargetLetter() {
    const r = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    setTargetLetter(r); setLearnCorrect(null); setLearnMessage(`Random target: ${r}`); setDetectedLetter(""); resetVisuals();
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage(`Random target letter ${r}`);
  }
  function resetLearnProgress() {
    setCompletedLetters([]); setLearnCorrect(null); setLearnMessage("Progress reset.");
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Progress reset");
  }

  function setSettingValue(key, value) { setSettings(p => ({ ...p, [key]:value })); }

  /* ─── sensor helpers ─────────────────────────────────────── */
  const timeSincePacket = lastPacketTime ? Math.floor((Date.now() - lastPacketTime) / 1000) : null;

  const troubleshootItems = useMemo(() => {
    const items = [];
    if (!connected) items.push({ kind:"err", icon:"🔴", text:"Hardware not connected — make sure your ESP32 is powered and the server (ws://localhost:5001) is running." });
    else            items.push({ kind:"ok",  icon:"🟢", text:"Hardware connected successfully." });

    if (connected && timeSincePacket !== null && timeSincePacket > 5)
      items.push({ kind:"warn", icon:"🟡", text:`No sensor data received for ${timeSincePacket}s — the ESP32 may have stopped sending. Try pressing a sensor.` });
    else if (connected && timeSincePacket !== null)
      items.push({ kind:"ok",  icon:"🟢", text:"Sensor data is arriving normally." });

    if (connected && sensorValues.every(v => v === 0))
      items.push({ kind:"warn", icon:"🟡", text:"All sensor readings are 0 — try pressing the fingertip sensors. If no response, check wiring." });
    else if (connected && sensorValues.some(v => v > 0))
      items.push({ kind:"ok",  icon:"🟢", text:"Sensor readings detected." });

    if (!items.some(i => i.kind === "err"))
      items.push({ kind:"ok", icon:"✅", text:"All systems look good." });

    return items;
  }, [connected, timeSincePacket, sensorValues]);

  /* ─── RENDER ─────────────────────────────────────────────── */
  return (
    <div className={`app-shell ${darkMode ? "dark-mode" : ""} ${settings.highContrast ? "high-contrast" : ""}`}>
      <div className="dashboard">

        {/* ── TOPBAR ── */}
        <header className="topbar">
          <div className="brand-left">
            <div className="brand-pill">
              <div className="brand-dot" />
              <span>BrailLearn</span>
            </div>
          </div>
          <div className="brand-right" />
          <div className="topbar-right" ref={settingsContainerRef}>
            <div className="conn-badge">
              <div className={`connection-dot ${connected ? "connected" : ""}`}
                title={connected ? "Hardware connected" : "Hardware disconnected"} />
              {connected ? "Connected" : "Disconnected"}
            </div>

            <button className="settings-button" aria-label="Open settings"
              onClick={() => setShowSettings(p => !p)}>
              <GearIcon />
            </button>

            {showSettings && (
              <div className="settings-dropdown" role="dialog" aria-label="Settings">
                <div className="settings-panel">
                  <div className="modal-header">
                    <h3>Settings</h3>
                    <button className="modal-close" onClick={() => setShowSettings(false)} aria-label="Close">×</button>
                  </div>
                  <div className="modal-body">
                    <div className="setting-row">
                      <label htmlFor="text-size-slider">Text Size: {textSize}px</label>
                      <input id="text-size-slider" className="full-width" type="range" min="24" max="96"
                        value={settings.textSize} onChange={e => setSettingValue("textSize", Number(e.target.value))} />
                    </div>
                    {[
                      ["audioEnabled","Audio"],
                      ["spokenConfirmations","Spoken Confirmations"],
                      ["darkMode","Dark Mode"],
                      ["highContrast","High Contrast"],
                    ].map(([key, label]) => (
                      <div key={key} className="setting-row checkbox-row">
                        <label htmlFor={key}>{label}</label>
                        <label className="toggle-switch">
                          <input id={key} type="checkbox" checked={settings[key]}
                            onChange={e => setSettingValue(key, e.target.checked)} />
                          <span className="slider" />
                        </label>
                      </div>
                    ))}
                    {settings.audioEnabled && (
                      <div className="setting-row">
                        <label>Audio Speed</label>
                        <div className="speed-options">
                          {["slow","normal","fast"].map(s => (
                            <button key={s} type="button"
                              className={`speed-button ${settings.audioSpeed === s ? "active" : ""}`}
                              onClick={() => setSettingValue("audioSpeed", s)}>
                              {s[0].toUpperCase() + s.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="body">
          {/* ── SIDEBAR ── */}
          <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
            <button className="collapse-button"
              onClick={() => setSidebarCollapsed(p => !p)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <span className={`collapse-arrow ${sidebarCollapsed ? "collapsed" : ""}`}>‹</span>
            </button>
            <nav>
              {navItems.map(item => (
                <SidebarItem key={item.label} icon={item.icon} label={item.label}
                  active={activeTab === item.label} collapsed={sidebarCollapsed}
                  onClick={() => setActiveTab(item.label)} />
              ))}
            </nav>
          </aside>

          {/* ── CONTENT ── */}
          <main className="content">
            <div className="sr-live-region" aria-live="polite" aria-atomic="true">{learnMessage}</div>

            {/* ══ HOME ══ */}
            {activeTab === "Home" && (
              <>
                <section className="section-card hero-card">
                  <p className="eyebrow">Audio-first braille note taker</p>
                  <h1 style={{marginBottom:8}}>Home</h1>
                  <p className="support-text">
                    Type with your BrailLearn gloves and watch text appear here. You can also
                    play it back as audio, save it as a note, or export it to a file.
                  </p>
                </section>

                <section className="section-card">
                  <h2 style={{marginBottom:14}}>Current Note</h2>
                  <div className="text-display" style={{ fontSize:`${textSize}px` }}>
                    <span className="typed-text">{text}</span>
                    <span className="cursor" />
                  </div>

                  <div className="action-row">
                    <button className="action-button primary"
                      onClick={() => speakText(text || "There is no note text yet.", audioSpeed)}>
                      <VolumeIcon /> Play Audio
                    </button>
                    <button className="action-button" onClick={handleSaveNote}>💾 Save Note</button>
                    <button className="action-button" onClick={exportNoteAsTxt}>📄 Export .txt</button>
                    <button className="action-button" onClick={handleBackspace}>⌫ Backspace</button>
                    <button className="action-button" onClick={handleClear}>✕ Clear</button>
                  </div>

                  <div className="status-chip-row">
                    <div className="status-chip">
                      <strong>Last Letter:</strong> {detectedLetter || "—"}
                    </div>
                    <div className="status-chip">
                      <strong>Hardware:</strong> {connected ? "✅ Connected" : "⚠️ Disconnected"}
                    </div>
                    <div className="status-chip">
                      <strong>Length:</strong> {text.length} chars
                    </div>
                  </div>
                </section>

                {/* Demo keyboard */}
                <section className="section-card">
                  <h2 style={{marginBottom:4}}>Quick Demo</h2>
                  <p className="support-text" style={{marginBottom:14}}>
                    No gloves? Tap any letter to test the display and audio output.
                  </p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {LETTERS.map(l => (
                      <button key={l} className="action-button compact-button"
                        style={{minWidth:40,justifyContent:"center",fontFamily:"var(--font-mono)",fontWeight:700}}
                        onClick={() => handleLetterInput(l)}>{l}</button>
                    ))}
                  </div>
                </section>

                <section className="section-card">
                  <h2 style={{marginBottom:8}}>Braille &amp; Glove Preview</h2>
                  <p className="support-text" style={{marginBottom:14}}>
                    Visual aid for low-vision users, instructors, and demos.
                  </p>
                  <BrailleHandsPreview brailleDots={brailleDots} fingers={fingers} />
                </section>
              </>
            )}

            {/* ══ LEARN ══ */}
            {activeTab === "Learn" && (
              <>
                <section className="section-card hero-card">
                  <p className="eyebrow">Practice and exploration</p>
                  <h1 style={{marginBottom:6}}>Learn</h1>
                  <p className="support-text">
                    Practice mode gives you a target letter to press. Explore mode lets you
                    freely discover patterns.
                  </p>
                </section>

                <section className="section-card compact-card">
                  <div className="learn-topbar">
                    <div className="learn-mode-toggle">
                      {["practice","explore"].map(m => (
                        <button key={m}
                          className={`mode-button ${learnMode===m?"active":""}`}
                          onClick={() => { setLearnMode(m); setLearnCorrect(null); setLearnMessage(`${m[0].toUpperCase()+m.slice(1)} mode.`); }}>
                          {m[0].toUpperCase()+m.slice(1)}
                        </button>
                      ))}
                    </div>
                    {learnMode === "practice" && (
                      <div className="learn-select-group">
                        <label htmlFor="target-letter">Target:</label>
                        <select id="target-letter" value={targetLetter}
                          onChange={e => { setTargetLetter(e.target.value); setLearnCorrect(null); setDetectedLetter(""); resetVisuals(); }}>
                          {LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </section>

                <div className="learn-layout">
                  {/* Left panel */}
                  <section className="section-card">
                    <h2 style={{marginBottom:14}}>{learnMode==="practice" ? "Target Letter" : "Detected Letter"}</h2>
                    <div className="target-letter-box">
                      <div className="big-letter">{learnMode==="practice" ? targetLetter : (detectedLetter||"—")}</div>
                      <button className="action-button compact-button"
                        onClick={() => speakText(learnMode==="practice" ? `Target letter ${targetLetter}` : (detectedLetter?`Detected ${detectedLetter}`:"No letter detected yet"), audioSpeed)}>
                        <VolumeIcon /> Speak
                      </button>
                    </div>

                    {learnMode === "practice" ? (
                      <div className="tip-box">
                        <h3>Dot Pattern</h3>
                        <p>Active dots: {LETTER_PATTERNS[targetLetter].map((on,i)=>on?i+1:null).filter(Boolean).join(", ") || "none"}</p>
                        <p>Press the matching finger combination on your gloves.</p>
                      </div>
                    ) : (
                      <div className="tip-box">
                        <h3>Explore Mode</h3>
                        <p>Press any combination of fingers on your gloves to discover what letter it makes.</p>
                      </div>
                    )}
                  </section>

                  {/* Right panel */}
                  <section className="section-card">
                    <h2 style={{marginBottom:14}}>Feedback</h2>
                    <div className={`learn-feedback ${learnCorrect===true?"correct":learnCorrect===false?"incorrect":""}`}>
                      {learnMessage}
                    </div>

                    {learnMode === "practice" && (
                      <>
                        <div className="progress-wrap">
                          <div className="learn-progress">
                            <div className="learn-progress-bar">
                              <div className="learn-progress-fill"
                                style={{width:`${(completedLetters.length/26)*100}%`}} />
                            </div>
                            <span>{completedLetters.length} / 26 letters mastered</span>
                          </div>
                        </div>
                        <div className="learn-bottom-actions">
                          <button onClick={nextTargetLetter}>Next →</button>
                          <button onClick={randomTargetLetter}>🎲 Random</button>
                          <button onClick={resetLearnProgress}>↺ Reset</button>
                        </div>
                      </>
                    )}

                    <div className="status-chip-row learn-status-row">
                      <div className="status-chip">
                        <strong>Hardware:</strong> {connected ? "✅ Connected" : "⚠️ Disconnected"}
                      </div>
                      {detectedLetter && (
                        <div className="status-chip">
                          <strong>Last input:</strong> {detectedLetter}
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                <section className="section-card compact-card">
                  <h2 style={{marginBottom:12}}>Braille &amp; Glove Preview</h2>
                  <BrailleHandsPreview brailleDots={brailleDots} fingers={fingers} />
                </section>
              </>
            )}

            {/* ══ NOTES ══ */}
            {activeTab === "Notes" && (
              <section className="section-card">
                <div className="notes-header">
                  <div>
                    <h1 style={{marginBottom:4}}>Saved Notes</h1>
                    <p className="support-text">{notes.length} note{notes.length!==1?"s":""} · {deletedNotes.length} in trash</p>
                  </div>
                  <button className="action-button" onClick={() => setActiveTab("Home")} style={{alignSelf:"flex-start"}}>
                    + New Note
                  </button>
                </div>

                <div className="notes-toolbar">
                  <div className="notes-search">
                    <input type="text" placeholder="🔍 Search notes…"
                      value={noteSearch} onChange={e => setNoteSearch(e.target.value)}
                      className="search-input" aria-label="Search notes" />
                  </div>
                  <div className="notes-sort">
                    <select value={noteSort} onChange={e => setNoteSort(e.target.value)} aria-label="Sort notes">
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="longest">Longest</option>
                      <option value="shortest">Shortest</option>
                    </select>
                  </div>
                </div>

                {notes.length === 0 && !noteSearch ? (
                  <div className="notes-empty">
                    <p>No notes yet.</p>
                    <p className="support-text">Go to the Home page and type something with your gloves, then hit Save Note.</p>
                  </div>
                ) : filteredNotes.length === 0 && noteSearch ? (
                  <div className="notes-empty">
                    <p>No notes match "<strong>{noteSearch}</strong>"</p>
                  </div>
                ) : (
                  <ul className="notes-list">
                    {filteredNotes.map(note => (
                      <li key={note.id} className={`note-item ${editingId===note.id?"editing":""}`}>
                        {editingId === note.id ? (
                          <div className="note-edit-area">
                            <textarea className="note-textarea" value={editText}
                              onChange={e => setEditText(e.target.value)} rows={5}
                              aria-label="Edit note" />
                            <div className="note-actions">
                              <button className="save-btn" onClick={saveEditedNote}>Save</button>
                              <button className="cancel-btn" onClick={cancelEditing}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="note-content">
                              <p className="note-text">{note.text}</p>
                              <span className="note-date">{note.createdAt}</span>
                            </div>
                            <div className="note-actions">
                              <button onClick={() => speakText(note.text, audioSpeed)} title="Read aloud">🔊</button>
                              <button onClick={() => startEditingNote(note)} title="Edit">✏️</button>
                              <button onClick={() => deleteNote(note.id)} title="Move to trash">🗑️</button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {deletedNotes.length > 0 && (
                  <div className="trash-section">
                    <div className="trash-header">
                      <h2>🗑️ Trash ({deletedNotes.length})</h2>
                      <button className="empty-trash-btn" onClick={emptyTrash}>Empty Trash</button>
                    </div>
                    <ul className="notes-list trash-list">
                      {deletedNotes.map(note => (
                        <li key={note.id} className="note-item">
                          <div className="note-content">
                            <p className="note-text">{note.text}</p>
                            <span className="note-date">Deleted: {note.deletedAt}</span>
                          </div>
                          <div className="note-actions">
                            <button onClick={() => restoreNote(note.id)} title="Restore">♻️</button>
                            <button onClick={() => permanentlyDeleteNote(note.id)} title="Delete forever">💣</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* ══ HISTORY ══ */}
            {activeTab === "History" && (
              <section className="section-card">
                <h1 style={{marginBottom:6}}>History</h1>
                <p className="support-text">Track your note entries and practice attempts.</p>

                <div className="history-sections">
                  {/* Stats bar */}
                  {history.practice.length > 0 && (
                    <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                      {[
                        [history.practice.filter(p=>p.type==="correct").length, "Correct"],
                        [history.practice.filter(p=>p.type==="incorrect").length, "Incorrect"],
                        [Math.round(history.practice.filter(p=>p.type==="correct").length/Math.max(history.practice.length,1)*100)+"%", "Accuracy"],
                        [`${completedLetters.length}/26`, "Mastered"],
                      ].map(([val,lab]) => (
                        <div key={lab} className="stat-box" style={{flex:"1 1 100px"}}>
                          <span className="stat-value">{val}</span>
                          <span className="stat-label">{lab}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="history-section">
                    <div className="history-section-header">
                      <NotesIcon /> Recent Notes
                    </div>
                    {history.notes.length === 0 ? (
                      <p className="history-empty">No notes saved yet.</p>
                    ) : (
                      <ul className="history-list">
                        {history.notes.slice(0,10).map((item,i) => (
                          <li key={i} className="history-item">
                            <span className="history-icon">📝</span>
                            <span className="history-text">{item.text}</span>
                            <span className="history-time">{item.createdAt}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="history-section">
                    <div className="history-section-header">
                      <LearnIcon /> Practice Attempts
                    </div>
                    {history.practice.length === 0 ? (
                      <p className="history-empty">No practice attempts yet.</p>
                    ) : (
                      <ul className="history-list">
                        {history.practice.slice(0,10).map((item,i) => (
                          <li key={i} className={`history-item ${item.type}`}>
                            <span className="history-icon">{item.type==="correct"?"✓":"✗"}</span>
                            <span className="history-text">
                              Entered <strong>{item.letter}</strong> · target was {item.target}
                            </span>
                            <span className="history-time">{item.createdAt}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="history-actions">
                  <button className="action-button"
                    onClick={() => { if (window.confirm("Clear all history?")) setHistory({notes:[],practice:[],sessions:[]}); }}>
                    Clear History
                  </button>
                </div>
              </section>
            )}

            {/* ══ SENSOR DATA ══ */}
            {activeTab === "Sensor Data" && (
              <div className="sensor-page">
                <section className="section-card hero-card">
                  <p className="eyebrow">Hardware diagnostics</p>
                  <h1 style={{marginBottom:6}}>Sensor Data</h1>
                  <p className="support-text">
                    Live readings from your six FSR fingertip sensors. Use this page to check
                    that everything is working and to troubleshoot problems.
                  </p>
                </section>

                {/* Troubleshoot section — prominent for basic users */}
                <section className="section-card">
                  <h2 style={{marginBottom:14}}>Status &amp; Troubleshooting</h2>
                  <ul className="trouble-list">
                    {troubleshootItems.map((item, i) => (
                      <li key={i} className={`trouble-item ${item.kind==="ok"?"ok-item":item.kind==="warn"?"warn-item":"err-item"}`}>
                        <span className="ti-icon">{item.icon}</span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Live finger pressure */}
                <section className="section-card">
                  <h2 style={{marginBottom:14}}>Live Sensor Readings</h2>
                  <div className="sensor-grid">
                    {FINGER_NAMES.map((name, i) => {
                      const pct = Math.round(sensorValues[i] * 100);
                      const active = pct > 10;
                      return (
                        <div key={i} className={`sensor-finger-card ${active?"active":""}`}>
                          <div className="sensor-finger-label">{i < 3 ? "Left Hand" : "Right Hand"}</div>
                          <div className="sensor-finger-name">{name.split("-")[1]}</div>
                          <div className="sensor-bar-track">
                            <div className="sensor-bar-fill" style={{width:`${pct}%`, background: FINGER_COLORS[i]}} />
                          </div>
                          <div className="sensor-value">{pct}%</div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Chart */}
                <section className="section-card">
                  <h2 style={{marginBottom:14}}>Input Over Time</h2>
                  <div className="sensor-chart-wrap">
                    <SensorChart history={sensorHistory} />
                  </div>
                  <div className="chart-legend">
                    {FINGER_NAMES.map((name, i) => (
                      <div key={i} className="chart-legend-item">
                        <div className="legend-dot" style={{background:FINGER_COLORS[i]}} />
                        {name}
                      </div>
                    ))}
                  </div>
                </section>

                {/* Advanced section */}
                <section className="section-card">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <h2 style={{margin:0}}>Advanced</h2>
                    <button className="adv-toggle" onClick={() => setShowAdvanced(p => !p)}>
                      {showAdvanced ? "Hide ↑" : "Show ↓"}
                    </button>
                  </div>
                  <p className="support-text">Raw hardware diagnostics for technical users.</p>

                  {showAdvanced && (
                    <div className="adv-section">
                      <span className="adv-label">Connection Diagnostics</span>
                      <div className="diag-grid">
                        <div className="diag-row">
                          <span className="diag-label">WebSocket</span>
                          <span className={`diag-value ${connected?"ok":"err"}`}>{connected?"Connected":"Disconnected"}</span>
                        </div>
                        <div className="diag-row">
                          <span className="diag-label">Round-trip latency</span>
                          <span className={`diag-value ${wsLatency===null?"warn":wsLatency<50?"ok":"warn"}`}>
                            {wsLatency !== null ? `${wsLatency} ms` : "—"}
                          </span>
                        </div>
                        <div className="diag-row">
                          <span className="diag-label">Last packet</span>
                          <span className={`diag-value ${timeSincePacket===null?"warn":timeSincePacket<5?"ok":"warn"}`}>
                            {timeSincePacket !== null ? `${timeSincePacket}s ago` : "No data"}
                          </span>
                        </div>
                        <div className="diag-row">
                          <span className="diag-label">Server address</span>
                          <span className="diag-value">ws://localhost:5001</span>
                        </div>
                      </div>

                      <span className="adv-label" style={{display:"block",marginTop:16}}>Raw ADC Values (0–4095)</span>
                      <div className="diag-grid">
                        {FINGER_NAMES.map((name, i) => (
                          <div key={i} className="diag-row">
                            <span className="diag-label">{name}</span>
                            <span className="diag-value">{sensorAdcValues[i] ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ══ ABOUT ══ */}
            {activeTab === "About" && (
              <div className="about-page">
                <section className="section-card hero-card">
                  <p className="eyebrow">UT Dallas Engineering Project</p>
                  <h1 style={{marginBottom:8}}>About BrailLearn</h1>
                  <p className="support-text">
                    BrailLearn is a wearable braille input glove that helps people who are blind,
                    visually impaired, or nonverbal communicate more easily. Each finger has a
                    force-sensitive resistor (FSR) that detects pressure. Different finger
                    combinations map to braille letters, which are translated into text and audio
                    output in real time.
                  </p>
                </section>

                <section className="section-card">
                  <h2 style={{marginBottom:6}}>How It Works</h2>
                  <p className="support-text" style={{marginBottom:14}}>
                    The glove has six FSR sensors — thumb, middle, and ring finger on each hand.
                    Pressing different combinations of fingers produces a 6-bit pattern that maps
                    directly to braille dot patterns. An ESP32 microcontroller reads the sensors
                    and streams the data over WebSocket to this dashboard.
                  </p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
                    {[
                      ["🧤","Hardware","6 FSR sensors, ESP32, lightweight gloves"],
                      ["📡","Connection","WebSocket at ws://localhost:5001"],
                      ["🔊","Output","Text display + speech synthesis"],
                    ].map(([icon,label,desc]) => (
                      <div key={label} className="stat-box" style={{alignItems:"flex-start",gap:6,padding:"16px"}}>
                        <span style={{fontSize:"1.5rem"}}>{icon}</span>
                        <span className="stat-label">{label}</span>
                        <span style={{fontSize:".88rem",color:"var(--text-mid)",lineHeight:1.5}}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="section-card">
                  <h2 style={{marginBottom:14}}>Meet the Team</h2>
                  <div className="team-grid">
                    {[
                      { name:"Zubiyaa Khan",     role:"CS Lead",                bio:"Senior in CS, passionate about hardware/software integration and accessibility technology." },
                      { name:"Presley Churchman", role:"Electrical Engineering", bio:"Freshman EE focused on sensor circuits and the firmware/software overlap. UT Dallas tennis team." },
                      { name:"Kasish Jain",       role:"Computer Engineering",  bio:"Sophomore CE interested in embedded systems and biomedical applications." },
                      { name:"Jayne McGovern",    role:"Mechanical Engineering", bio:"Freshman ME focused on sensors, ergonomics, and cross-discipline coordination." },
                      { name:"Paris Ngo",         role:"Mechanical Engineering", bio:"Junior ME with interests in medical devices and automotive design." },
                      { name:"Melissa Manandhar", role:"Biomedical Engineering", bio:"Freshman BME focused on accessible medical devices and human-technology integration." },
                    ].map(m => (
                      <div key={m.name} className="team-card">
                        <div className="team-name">{m.name}</div>
                        <div className="team-role">{m.role}</div>
                        <div className="team-bio">{m.bio}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="section-card">
                  <h2 style={{marginBottom:14}}>References</h2>
                  <ul className="cite-list">
                    {[
                      "CDC. (2024). Fast facts: Vision loss. cdc.gov",
                      "McDonnall et al. (2025). Factors associated with proficient Braille skills in adults. JVIB, 119(2).",
                      "Iowa Department for the Blind. How to read and write braille. blind.iowa.gov",
                      "Vision IP. (2025). The challenges of learning braille as an adult. visionip.org",
                      "DLSU Research Congress. (2021). Braille communication devices proceedings.",
                      "Dolphin et al. (2024). Information accessibility in the form of braille. IEEE OJEMB, 5, 205–209.",
                    ].map((c,i) => <li key={i} className="cite-item">{c}</li>)}
                  </ul>
                </section>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ─── SENSOR CHART ───────────────────────────────────────── */
function SensorChart({ history }) {
  const W = 800, H = 160, PAD = 8;
  const maxLen = history.reduce((m, h) => Math.max(m, h.length), 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
      {/* Grid lines */}
      {[0.25,0.5,0.75,1].map(y => (
        <line key={y} x1={PAD} y1={H - y*(H-PAD*2) - PAD} x2={W-PAD} y2={H - y*(H-PAD*2) - PAD}
          stroke="var(--border-col)" strokeWidth="1" opacity="0.5" />
      ))}
      {history.map((vals, fi) => {
        if (vals.length < 2) return null;
        const points = vals.map((v, i) => {
          const x = PAD + (i / (Math.max(maxLen,1) - 1)) * (W - PAD*2);
          const y = H - PAD - v * (H - PAD*2);
          return `${x},${y}`;
        }).join(" ");
        return (
          <polyline key={fi} points={points} fill="none"
            stroke={FINGER_COLORS[fi]} strokeWidth="2" opacity="0.85" strokeLinejoin="round" />
        );
      })}
      {maxLen === 0 && (
        <text x={W/2} y={H/2} textAnchor="middle" dominantBaseline="middle"
          fill="var(--text-muted)" fontSize="14">
          Waiting for sensor data…
        </text>
      )}
    </svg>
  );
}

/* ─── BRAILLE + HANDS ────────────────────────────────────── */
function BrailleHandsPreview({ brailleDots, fingers }) {
  return (
    <div className="bottom-row">
      <section className="braille-panel">
        <div className="braille-panel-header">Braille Cell</div>
        <div className="braille-grid">
          {brailleDots.map((active, i) => (
            <div key={i} className="braille-cell">
              <div className={`braille-dot ${active?"active":""}`} />
            </div>
          ))}
        </div>
      </section>

      <section className="hands-panel">
        <div className="hands-header">
          <span className="hands-side-label">Left Hand</span>
          <span className="hands-side-label">Right Hand</span>
        </div>
        <div className="hands-body">
          {[
            { side:"left",  cols:["Thumb","Middle","Ring"],  vals:[fingers.left.thumb, fingers.left.middle, fingers.left.ring]  },
            null,
            { side:"right", cols:["Thumb","Middle","Ring"],  vals:[fingers.right.thumb,fingers.right.middle,fingers.right.ring] },
          ].map((col, i) => col === null
            ? <div key="div" className="hand-divider" />
            : (
              <div key={col.side} className="hand-column">
                <div className="finger-name-row">{col.cols.map(c => <span key={c}>{c}</span>)}</div>
                <div className="finger-icon-row">{col.vals.map((active, j) => <FingerSymbol key={j} active={active} />)}</div>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}

/* ─── SIDEBAR ITEM ───────────────────────────────────────── */
function SidebarItem({ icon, label, active, collapsed, onClick }) {
  return (
    <button className={`nav-item ${active?"active":""} ${collapsed?"collapsed":""}`} onClick={onClick}
      aria-current={active ? "page" : undefined} title={collapsed ? label : undefined}>
      <span className="nav-icon">{icon}</span>
      {!collapsed && <span className="nav-label">{label}</span>}
    </button>
  );
}

/* ─── ICONS ──────────────────────────────────────────────── */
function FingerSymbol({ active }) {
  return (
    <div className={`finger-symbol ${active?"active":""}`}>
      <svg viewBox="0 0 64 64" className="finger-svg" aria-hidden="true">
        <path d="M24 50V23c0-2 1.6-3.5 3.5-3.5S31 21 31 23v11h1V18c0-2 1.6-3.5 3.5-3.5S39 16 39 18v16h1V21c0-2 1.6-3.5 3.5-3.5S47 19 47 21v18c0 7-5.8 13-13 13h-2c-4.7 0-8-1.9-10.5-5.7l-4.4-6.8c-1-1.5-.6-3.6.9-4.6 1.4-.9 3.3-.6 4.4.7L24 39V23" />
      </svg>
    </div>
  );
}

function HomeIcon()    { return <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5v7.5a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z"/></svg>; }
function LearnIcon()   { return <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true"><path d="M12 5 3 9.5 12 14l7-3.5V17h2V9.5zM6 12.2V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.8L12 15z"/></svg>; }
function HistoryIcon() { return <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.3 4H3l3.2-3.2L9.5 9H7.8A5 5 0 1 0 12 7v5l4 2-.8 1.8L10 13V5z"/></svg>; }
function SensorIcon()  { return <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true"><path d="M3 18h2v-6H3zm4 0h2V6H7zm4 0h2v-3h-2zm4 0h2V9h-2zm4 0h2v-9h-2z"/></svg>; }
function InfoIcon()    { return <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 7h2V7h-2zm0 8h2v-6h-2z"/></svg>; }
function NotesIcon()   { return <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true"><path d="M6 3h9l3 3v15H6zM14 3v4h4M8 10h8M8 14h8M8 18h5"/></svg>; }
function GearIcon()    { return <svg viewBox="0 0 24 24" className="gear-svg" aria-hidden="true"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/></svg>; }
function VolumeIcon()  { return <svg viewBox="0 0 24 24" className="volume-svg" aria-hidden="true"><path d="M5 10h4l5-4v12l-5-4H5zm11.5 2a4.5 4.5 0 0 0-2.2-3.9v7.8a4.5 4.5 0 0 0 2.2-3.9zm1.8 0c0 3-1.7 5.6-4.2 6.9v-2.2a5 5 0 0 0 0-9.4V5.1c2.5 1.3 4.2 3.9 4.2 6.9z"/></svg>; }

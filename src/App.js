import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./App.css";
import TypingGame from "./TypingGame";

/* ─── BRAILLE DATA ─────────────────────────────────────── */
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
const FINGER_COLORS = ["#5b84c4","#3aad6e","#e06c3e","#a050c8","#d4a020","#4ab8d0"];
const FINGER_NAMES  = ["L-Thumb","L-Middle","L-Ring","R-Thumb","R-Middle","R-Ring"];

const DEFAULT_FINGERS = {
  left:  { thumb:false, middle:false, ring:false },
  right: { thumb:false, middle:false, ring:false },
};
const DEFAULT_SETTINGS = {
  textSize:56, audioEnabled:true, audioSpeed:"normal",
  darkMode:false, highContrast:false, spokenConfirmations:true,
};

/* ─── SPEECH UTIL ──────────────────────────────────────── */
let _speechTimer = null;
function speakText(msg, speed = "normal") {
  if (!("speechSynthesis" in window) || !msg) return;
  clearTimeout(_speechTimer);
  window.speechSynthesis.cancel();
  _speechTimer = setTimeout(() => {
    const u = new SpeechSynthesisUtterance(msg);
    u.rate  = speed === "slow" ? 0.75 : speed === "fast" ? 1.3 : 1;
    window.speechSynthesis.speak(u);
  }, 80);
}

/* ─── FOCUS TRAP HOOK ──────────────────────────────────── */
function useFocusTrap(active) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const focusable = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    first?.focus();
    const onKey = e => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first?.focus(); }
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [active]);
  return ref;
}

/* ─── MAIN APP ─────────────────────────────────────────── */
export default function App() {
  const [activeTab,         setActiveTab]         = useState("Home");
  const [sidebarCollapsed,  setSidebarCollapsed]  = useState(false);

  const [text,              setText]              = useState("");
  const [brailleDots,       setBrailleDots]       = useState(Array(6).fill(false));
  const [fingers,           setFingers]           = useState(DEFAULT_FINGERS);

  const [notes,             setNotes]             = useState([]);
  const [deletedNotes,      setDeletedNotes]      = useState([]);
  const [editingId,         setEditingId]         = useState(null);
  const [editText,          setEditText]          = useState("");
  const [noteSearch,        setNoteSearch]        = useState("");
  const [noteSort,          setNoteSort]          = useState("newest");
  const [loadedNoteId,      setLoadedNoteId]      = useState(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  const [connected,         setConnected]         = useState(false);
  const [showSettings,      setShowSettings]      = useState(false);
  const settingsRef         = useRef(null);
  const settingsTriggerRef  = useRef(null);
  const settingsTrapRef     = useFocusTrap(showSettings);

  const [settings,          setSettings]          = useState(DEFAULT_SETTINGS);

  const [learnMode,         setLearnMode]         = useState("practice");
  const [targetLetter,      setTargetLetter]      = useState("A");
  const [detectedLetter,    setDetectedLetter]    = useState("");
  const [learnMessage,      setLearnMessage]      = useState("Waiting for glove input.");
  const [learnCorrect,      setLearnCorrect]      = useState(null);
  const [completedLetters,  setCompletedLetters]  = useState([]);

  const [history,           setHistory]           = useState({ notes:[], practice:[], sessions:[] });

  const [sensorValues,      setSensorValues]      = useState(Array(6).fill(0));
  const [sensorAdcValues,   setSensorAdcValues]   = useState(Array(6).fill(0));
  const [sensorHistory,     setSensorHistory]     = useState(() => Array(6).fill(null).map(() => []));
  const [lastPacketTime,    setLastPacketTime]    = useState(null);
  const [wsLatency,         setWsLatency]         = useState(null);
  const [showAdvanced,      setShowAdvanced]      = useState(false);
  const [showRefs,          setShowRefs]          = useState(false);
  const HISTORY_LEN = 60;

<<<<<<< HEAD
=======
  // ── WEBSOCKET REFS ────────────────────────────────────────
  const wsRef        = useRef(null); // Holds the live WebSocket instance
  const reconnectRef = useRef(null); // Holds the setTimeout handle for reconnect

  // ── DEDUP REF ─────────────────────────────────────────────
  // Tracks the last letter received and when, to drop duplicates.
  // WHY: React 18 StrictMode runs every useEffect TWICE in development
  // (mount → fake unmount → mount again). connect() runs twice → two
  // WebSocket objects open at the same time. Both receive the server
  // broadcast, so onmessage fires twice → same letter appended twice.
  // A ref is used instead of state because refs persist across re-renders
  // without causing re-renders, and we need to write to it synchronously
  // inside onmessage before the next message could arrive.
  const lastMsgRef = useRef({ letter: "", time: 0 });
  const DEDUP_MS   = 500; // Drop duplicate letters arriving within this window (ms)

  /* ─ nav ─ */
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
  const navItems = useMemo(() => [
    { label:"Home",        icon:<HomeIcon /> },
    { label:"Learn",       icon:<LearnIcon /> },
    { label:"Notes",       icon:<NotesIcon /> },
    { label:"History",     icon:<HistoryIcon /> },
    { label:"Sensor Data", icon:<SensorIcon /> },
    { label:"About",       icon:<InfoIcon /> },
  ], []);

  /* ─── persist ──────────────────────────────────────────── */
  useEffect(() => {
    const load = (key, def) => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; } };
    setNotes(load("braille-notes", []));
    setDeletedNotes(load("braille-deleted-notes", []));
    setSettings({ ...DEFAULT_SETTINGS, ...load("braille-settings", {}) });
    const prog = load("braille-learn-progress", {});
    setCompletedLetters(prog.completedLetters || []);
    setHistory(load("braille-history", { notes:[], practice:[], sessions:[] }));
  }, []);

<<<<<<< HEAD
  useEffect(() => { localStorage.setItem("braille-notes",          JSON.stringify(notes)); },          [notes]);
  useEffect(() => { localStorage.setItem("braille-deleted-notes",  JSON.stringify(deletedNotes)); },   [deletedNotes]);
  useEffect(() => { localStorage.setItem("braille-settings",       JSON.stringify(settings)); },       [settings]);
  useEffect(() => { localStorage.setItem("braille-learn-progress", JSON.stringify({completedLetters})); }, [completedLetters]);
  useEffect(() => { localStorage.setItem("braille-history",        JSON.stringify(history)); },        [history]);
=======
  useEffect(() => { localStorage.setItem("braille-notes",         JSON.stringify(notes));            }, [notes]);
  useEffect(() => { localStorage.setItem("braille-deleted-notes", JSON.stringify(deletedNotes));     }, [deletedNotes]);
  useEffect(() => { localStorage.setItem("braille-settings",      JSON.stringify(settings));         }, [settings]);
  useEffect(() => { localStorage.setItem("braille-learn-progress",JSON.stringify({ completedLetters })); }, [completedLetters]);
  useEffect(() => { localStorage.setItem("braille-history",       JSON.stringify(history));          }, [history]);
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0

  /* ─── outside click — close settings ──────────────────── */
  useEffect(() => {
    const fn = e => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target)
      ) setShowSettings(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  /* ─── Escape key — close settings ─────────────────────── */
  useEffect(() => {
    const fn = e => {
      if (e.key === "Escape" && showSettings) {
        setShowSettings(false);
        settingsTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [showSettings]);

<<<<<<< HEAD
  /* ─── keyboard nav Alt+1-6 ─────────────────────────────── */
  useEffect(() => {
    const TABS = navItems.map(n => n.label);
    const fn = e => { if (e.altKey && e.key >= "1" && e.key <= "6") { const t = TABS[parseInt(e.key)-1]; if(t){setActiveTab(t);e.preventDefault();} } };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [navItems]);

  /* ─── WebSocket ────────────────────────────────────────── */
  const liveRef = useRef({ learnMode, targetLetter, completedLetters, activeTab, settings });
  useEffect(() => { liveRef.current = { learnMode, targetLetter, completedLetters, activeTab, settings }; },
    [learnMode, targetLetter, completedLetters, activeTab, settings]);

  useEffect(() => {
    let ws;
    const ping = { id:null };
    const times = {};
    let ctr = 0;
    try {
      ws = new WebSocket("ws://localhost:5001");
      ws.addEventListener("open", () => {
        setConnected(true);
        ping.id = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) { const id=++ctr; times[id]=performance.now(); ws.send(JSON.stringify({type:"ping",id})); }
        }, 2000);
      });
      ws.addEventListener("message", evt => {
        try {
          const d = JSON.parse(evt.data);
          if (d.type==="pong"&&times[d.id]) { setWsLatency(Math.round(performance.now()-times[d.id])); delete times[d.id]; return; }
          if (d.type==="status") { setConnected(!!d.connected); return; }
          if (d.type==="sensor"&&Array.isArray(d.values)) {
            const vals=d.values.slice(0,6);
            setSensorValues(vals); setSensorAdcValues(d.adc||vals.map(v=>Math.round(v*40.95)));
=======
  /* ─── WebSocket — auto-connects, auto-reconnects, dedup ─── */
  // learnRef keeps the latest state values accessible inside the WS
  // callback closure without the effect needing to re-run on every change.
  const learnRef = useRef({ learnMode, targetLetter, completedLetters, activeTab, settings });
  useEffect(() => {
    learnRef.current = { learnMode, targetLetter, completedLetters, activeTab, settings };
  }, [learnMode, targetLetter, completedLetters, activeTab, settings]);

  useEffect(() => {
    const pingTimes   = {};
    let   pingCounter = 0;
    let   pingId      = null;

    const connect = () => {
      // ── Open connection to the Node.js bridge server on the LAN ──
      const ws = new WebSocket(`ws://${window.location.hostname}:5001`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // Identify this client as a frontend (server logs it)
        ws.send(JSON.stringify({ client: "frontend" }));

        // Start latency pings every 2 s
        pingId = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const id = ++pingCounter;
            pingTimes[id] = performance.now();
            ws.send(JSON.stringify({ type: "ping", id }));
          }
        }, 2000);
      };

      ws.onclose = () => {
        setConnected(false);
        clearInterval(pingId);
        // Schedule reconnect — prevents connection dropping silently
        reconnectRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        // On any error, close triggers onclose which schedules reconnect
        ws.close();
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);

          // ── Latency pong ──
          if (data.type === "pong" && pingTimes[data.id]) {
            setWsLatency(Math.round(performance.now() - pingTimes[data.id]));
            delete pingTimes[data.id];
            return;
          }

          // ── Connection status message ──
          if (data.type === "status") { setConnected(!!data.connected); return; }

          // ── Live sensor readings ──
          if (data.type === "sensor" && Array.isArray(data.values)) {
            const vals    = data.values.slice(0, 6);
            const adcVals = data.adc || vals.map(v => Math.round(v * 40.95));
            setSensorValues(vals);
            setSensorAdcValues(adcVals);
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
            setLastPacketTime(Date.now());
            setSensorHistory(prev=>prev.map((h,i)=>{const n=[...h,vals[i]??0];return n.length>HISTORY_LEN?n.slice(-HISTORY_LEN):n;}));
            return;
          }
<<<<<<< HEAD
          if (d.type==="letter"&&d.letter) { handleIncomingLetter(String(d.letter).toUpperCase()); return; }
          if (d.type==="pattern"&&Array.isArray(d.pattern)&&d.pattern.length===6) { handleIncomingPattern(d.pattern); return; }
        } catch(err) { console.error("ws",err); }
      });
      ws.addEventListener("close", ()=>{ setConnected(false); clearInterval(ping.id); });
      ws.addEventListener("error", ()=>{ setConnected(false); clearInterval(ping.id); });
    } catch { setConnected(false); }
    return () => { clearInterval(ping.id); if(ws) try{ws.close();}catch{} };
=======

          // ── Incoming letter ──
          if (data.type === "letter" && data.letter) {
            const letter = String(data.letter).toUpperCase();
            const now    = Date.now();

            // DEDUP: drop if the same letter arrives within DEDUP_MS.
            // This neutralises React StrictMode double-mount, multiple open
            // tabs, and any duplicate that slips past the server-side dedup.
            if (
              letter === lastMsgRef.current.letter &&
              now - lastMsgRef.current.time < DEDUP_MS
            ) {
              console.log("⚠️ Duplicate letter dropped:", letter);
              return;
            }
            // Update dedup ref BEFORE setState to prevent race conditions
            lastMsgRef.current = { letter, time: now };

            handleIncomingLetter(letter);
            return;
          }

          // ── Legacy gesture message type ──
          if (data.type === "gesture" && data.letter) {
            const letter = String(data.letter).toUpperCase();
            const now    = Date.now();

            if (
              letter === lastMsgRef.current.letter &&
              now - lastMsgRef.current.time < DEDUP_MS
            ) {
              console.log("⚠️ Duplicate letter dropped:", letter);
              return;
            }
            lastMsgRef.current = { letter, time: now };

            handleIncomingLetter(letter);
            return;
          }

          // ── Incoming raw pattern ──
          if (data.type === "pattern" && Array.isArray(data.pattern) && data.pattern.length === 6) {
            handleIncomingPattern(data.pattern);
            return;
          }

        } catch (err) {
          console.error("Bad WS message:", err, evt.data);
        }
      };
    };

    connect(); // Initial connection on mount

    // Cleanup: cancel reconnect timer and close socket on unmount
    // (also runs on StrictMode fake-unmount)
    return () => {
      clearTimeout(reconnectRef.current);
      clearInterval(pingId);
      wsRef.current?.close();
    };
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
  // eslint-disable-next-line
  }, []); // Empty deps — runs once on mount (twice in StrictMode dev)

  /* ─── derived ──────────────────────────────────────────── */
  const { darkMode, textSize, audioEnabled, audioSpeed } = settings;

  const filteredNotes = useMemo(() => {
    let r = [...notes];
    if (noteSearch) r = r.filter(n => n.text.toLowerCase().includes(noteSearch.toLowerCase()));
<<<<<<< HEAD
    if (noteSort==="oldest")        r.sort((a,b)=>a.id-b.id);
    else if (noteSort==="longest")  r.sort((a,b)=>b.text.length-a.text.length);
    else if (noteSort==="shortest") r.sort((a,b)=>a.text.length-b.text.length);
    else r.sort((a,b)=>b.id-a.id);
=======
    if (noteSort === "oldest")        r.sort((a,b) => a.id - b.id);
    else if (noteSort === "longest")  r.sort((a,b) => b.text.length - a.text.length);
    else if (noteSort === "shortest") r.sort((a,b) => a.text.length - b.text.length);
    else                              r.sort((a,b) => b.id - a.id);
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
    return r;
  }, [notes, noteSearch, noteSort]);

  const timeSincePacket = lastPacketTime ? Math.floor((Date.now()-lastPacketTime)/1000) : null;

  const troubleshootItems = useMemo(() => {
    const items = [];
    if (!connected) items.push({ kind:"err", label:"Not connected", text:"Make sure your ESP32 is powered on and the server is running at ws://localhost:5001." });
    else            items.push({ kind:"ok",  label:"Connected",     text:"Hardware is connected successfully." });
    if (connected && timeSincePacket!==null && timeSincePacket>5)
      items.push({ kind:"warn", label:"No recent data", text:`No sensor data for ${timeSincePacket}s. Try pressing a sensor, or check USB or power.` });
    else if (connected && timeSincePacket!==null)
      items.push({ kind:"ok",  label:"Data flowing",   text:"Sensor packets are arriving normally." });
    if (connected && sensorValues.every(v=>v===0))
      items.push({ kind:"warn", label:"All sensors zero", text:"All readings are 0. Press a fingertip sensor. If nothing changes, check wiring." });
    else if (connected && sensorValues.some(v=>v>0))
      items.push({ kind:"ok",  label:"Sensors responding", text:"At least one sensor is reading above zero." });
    if (!items.some(i=>i.kind==="err"))
      items.push({ kind:"ok", label:"All clear", text:"Everything looks good." });
    return items;
  }, [connected, timeSincePacket, sensorValues]);

  /* ─── speech helper ────────────────────────────────────── */
  function say(msg) {
    if (settings.audioEnabled && settings.spokenConfirmations) speakText(msg, settings.audioSpeed);
  }

  /* ─── visuals ──────────────────────────────────────────── */
  function resetVisuals() { setBrailleDots(Array(6).fill(false)); setFingers(DEFAULT_FINGERS); }
  function applyPatternToHands(p) {
    setFingers({ left:{ring:p[0],middle:p[1],thumb:p[2]}, right:{ring:p[3],middle:p[4],thumb:p[5]} });
  }
  function getLetterFromPattern(pattern) {
    for (const [letter,val] of Object.entries(LETTER_PATTERNS)) {
      if (JSON.stringify(val)===JSON.stringify(pattern)) return letter;
    }
    return null;
  }

  function handleIncomingPattern(pattern) {
    const detected = getLetterFromPattern(pattern);
    setBrailleDots(pattern); applyPatternToHands(pattern);
    if (detected) handleIncomingLetter(detected, pattern);
    else { setDetectedLetter("?"); setLearnCorrect(false); setLearnMessage("Pattern received but does not match a known letter."); }
  }

  function handleIncomingLetter(letter, incomingPattern) {
    const { learnMode, targetLetter, completedLetters, activeTab, settings } = liveRef.current;
    const pattern = incomingPattern || LETTER_PATTERNS[letter];
    if (!pattern) return;
    setDetectedLetter(letter); setBrailleDots(pattern); applyPatternToHands(pattern);

    if (activeTab==="Home") {
      setText(p=>p+letter);
      if (settings.audioEnabled && settings.spokenConfirmations) speakText(letter, settings.audioSpeed);
      return;
    }
    if (activeTab==="Learn") {
      if (learnMode==="practice") {
        const ok = letter===targetLetter;
        setLearnCorrect(ok);
<<<<<<< HEAD
        setLearnMessage(ok ? `Correct! You entered ${letter}.` : `Not quite. You entered ${letter}, but the target is ${targetLetter}.`);
        if (ok && !completedLetters.includes(letter)) setCompletedLetters(p=>[...p,letter]);
        setHistory(p=>({...p,practice:[{type:ok?"correct":"incorrect",letter,target:targetLetter,createdAt:new Date().toLocaleString()},...p.practice].slice(0,100)}));
        if (settings.audioEnabled && settings.spokenConfirmations) speakText(ok?`Correct. ${letter}`:`Incorrect. ${letter}`, settings.audioSpeed);
=======
        setLearnMessage(ok ? `Correct! You entered ${letter}.` : `Not quite — you entered ${letter}, target is ${targetLetter}.`);
        if (ok && !completedLetters.includes(letter)) setCompletedLetters(p => [...p, letter]);
        setHistory(p => ({
          ...p,
          practice: [{ type: ok?"correct":"incorrect", letter, target:targetLetter, createdAt:new Date().toLocaleString() }, ...p.practice].slice(0, 100),
        }));
        if (settings.spokenConfirmations && settings.audioEnabled)
          setLastSpokenMessage(ok ? `Correct. ${letter}` : `Incorrect. You entered ${letter}`);
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
      } else {
        setLearnCorrect(null);
        setLearnMessage(`Detected: ${letter}`);
        if (settings.audioEnabled && settings.spokenConfirmations) speakText(letter, settings.audioSpeed);
      }
    }
  }

<<<<<<< HEAD
  /* ─── home actions ─────────────────────────────────────── */
  function handleBackspace() { setText(p=>p.slice(0,-1)); say("Backspace"); }
  function handleClear()     { setText(""); setDetectedLetter(""); resetVisuals(); say("Cleared"); }
=======
  function handleBackspace() {
    setText(p => p.slice(0, -1));
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Backspace");
  }
  function handleClear() {
    setText(""); setDetectedLetter(""); resetVisuals();
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Cleared");
  }
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0

  function handleSaveNote() {
    if (!text.trim()) return;
    if (loadedNoteId) {
      setNotes(p=>p.map(n=>n.id===loadedNoteId?{...n,text:text.trim()}:n));
      setLoadedNoteId(null); say("Note updated");
    } else {
      const n = {id:Date.now(),text:text.trim(),createdAt:new Date().toLocaleString()};
      setNotes(p=>[n,...p]);
      setHistory(p=>({...p,notes:[{type:"note",text:text.trim().slice(0,50),createdAt:new Date().toLocaleString()},...p.notes].slice(0,50)}));
      say("Note saved");
    }
    setText(""); setDetectedLetter(""); resetVisuals();
  }

  function exportNoteAsTxt() {
    if (!text.trim()) return;
<<<<<<< HEAD
    const a = Object.assign(document.createElement("a"),{href:URL.createObjectURL(new Blob([text],{type:"text/plain"})),download:"braille-note.txt"});
    a.click(); URL.revokeObjectURL(a.href); say("Note exported");
=======
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([text], { type:"text/plain" })),
      download: "braille-note.txt",
    });
    a.click(); URL.revokeObjectURL(a.href);
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Note exported");
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
  }

  function loadNoteIntoEditor(note) {
    setText(note.text); setLoadedNoteId(note.id); setActiveTab("Home"); say("Note loaded for editing");
  }

  /* ─── notes actions ────────────────────────────────────── */
  function startEditingNote(note) { setEditingId(note.id); setEditText(note.text); }
  function saveEditedNote() {
    if (!editText.trim()) return;
    setNotes(p=>p.map(n=>n.id===editingId?{...n,text:editText.trim()}:n));
    setEditingId(null); setEditText(""); say("Note updated");
  }
<<<<<<< HEAD
  function cancelEditing()   { setEditingId(null); setEditText(""); }
=======
  function cancelEditing() { setEditingId(null); setEditText(""); }

>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
  function deleteNote(id) {
    const note = notes.find(n=>n.id===id);
    if (note) setDeletedNotes(p=>[{...note,deletedAt:new Date().toLocaleString()},...p]);
    setNotes(p=>p.filter(n=>n.id!==id));
    if (editingId===id) cancelEditing();
    say("Note moved to trash");
  }
  function restoreNote(id) {
    const note = deletedNotes.find(n=>n.id===id);
    if (note) { const {deletedAt,...rest}=note; setNotes(p=>[rest,...p]); }
    setDeletedNotes(p=>p.filter(n=>n.id!==id)); say("Note restored");
  }
<<<<<<< HEAD
  function permanentlyDeleteNote(id) { setDeletedNotes(p=>p.filter(n=>n.id!==id)); say("Note deleted"); }
  function emptyTrash()              { setDeletedNotes([]); say("Trash emptied"); }
=======
  function permanentlyDeleteNote(id) {
    setDeletedNotes(p => p.filter(n => n.id !== id));
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Note permanently deleted");
  }
  function emptyTrash() {
    setDeletedNotes([]);
    if (settings.spokenConfirmations && audioEnabled) setLastSpokenMessage("Trash emptied");
  }
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0

  /* ─── learn actions ────────────────────────────────────── */
  function nextTargetLetter() {
    const next = LETTERS[(LETTERS.indexOf(targetLetter)+1)%LETTERS.length];
    setTargetLetter(next); setLearnCorrect(null); setLearnMessage(`New target: ${next}`); setDetectedLetter(""); resetVisuals();
    say(`New target letter: ${next}`);
  }
  function randomTargetLetter() {
    const r = LETTERS[Math.floor(Math.random()*LETTERS.length)];
    setTargetLetter(r); setLearnCorrect(null); setLearnMessage(`Target: ${r}`); setDetectedLetter(""); resetVisuals();
    say(`Random target letter: ${r}`);
  }
  function resetLearnProgress() {
    setCompletedLetters([]); setTargetLetter("A"); setLearnCorrect(null);
    setLearnMessage("Progress reset. Starting from A."); setDetectedLetter(""); resetVisuals();
    say("Progress reset");
  }

  function setSettingValue(key, value) { setSettings(p=>({...p,[key]:value})); }

  /* ─── settings open/close helpers ─────────────────────── */
  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

<<<<<<< HEAD
  const closeSettings = useCallback(() => {
    setShowSettings(false);
    settingsTriggerRef.current?.focus();
  }, []);
=======
  const troubleshootItems = useMemo(() => {
    const items = [];
    if (!connected) items.push({ kind:"err",  icon:"🔴", text:"Hardware not connected — make sure your ESP32 is powered and the server (ws://192.168.1.25:5001) is running." });
    else            items.push({ kind:"ok",   icon:"🟢", text:"Hardware connected successfully." });
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0

  /* ─── RENDER ──────────────────────────────────────────── */
  return (
    <div className={`app-shell ${darkMode?"dark-mode":""} ${settings.highContrast?"high-contrast":""}`}>
      <div className="dashboard">

        {/* TOPBAR */}
        <header className="topbar">
          <div className="brand-left">
            <div className="brand-pill">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false" className="brand-logo-svg">
                <rect width="28" height="28" rx="7" fill="rgba(255,255,255,0.18)"/>
                {[[7,7],[7,14],[7,21],[16,7],[16,14]].map(([cx,cy],i)=>(
                  <circle key={i} cx={cx} cy={cy} r="3.2" fill="white"/>
                ))}
              </svg>
              <span>BrailLearn</span>
            </div>
          </div>
          <div className="brand-right" />
          <div className="topbar-right" ref={settingsRef}>
            <div className="conn-badge">
              <div
                className={`connection-dot ${connected?"connected":""}`}
                role="status"
                aria-label={connected ? "Hardware connected" : "Hardware disconnected"}
              />
              <span aria-hidden="true">{connected?"Connected":"Disconnected"}</span>
            </div>
            <button
              className="settings-button"
              aria-label="Open settings"
              aria-expanded={showSettings}
              aria-haspopup="dialog"
              ref={settingsTriggerRef}
              onClick={() => showSettings ? closeSettings() : openSettings()}
            >
              <GearIcon />
            </button>

            {showSettings && (
              <div
                className="settings-dropdown"
                role="dialog"
                aria-label="Settings"
                aria-modal="true"
                ref={settingsTrapRef}
              >
                <div className="settings-panel">
                  <div className="modal-header">
                    <h3 id="settings-title">Settings</h3>
                    <button className="modal-close" onClick={closeSettings} aria-label="Close settings">
                      <CloseIcon />
                    </button>
                  </div>
                  <div className="modal-body">

                    <div className="setting-row">
                      <label htmlFor="text-size-slider">Display Text Size: {textSize}px</label>
                      <input
                        id="text-size-slider"
                        className="full-width"
                        type="range" min="24" max="96"
                        value={settings.textSize}
                        onChange={e=>setSettingValue("textSize",Number(e.target.value))}
                      />
                    </div>
<<<<<<< HEAD

                    <div className="setting-row checkbox-row">
                      <div>
                        <label htmlFor="audioEnabled" style={{display:"block",fontWeight:700}}>Audio Playback</label>
                        <span className="setting-sub">Reads note text aloud when you press Play</span>
=======
                    {[
                      ["audioEnabled",         "Audio"],
                      ["spokenConfirmations",   "Spoken Confirmations"],
                      ["darkMode",              "Dark Mode"],
                      ["highContrast",          "High Contrast"],
                    ].map(([key, label]) => (
                      <div key={key} className="setting-row checkbox-row">
                        <label htmlFor={key}>{label}</label>
                        <label className="toggle-switch">
                          <input id={key} type="checkbox" checked={settings[key]}
                            onChange={e => setSettingValue(key, e.target.checked)} />
                          <span className="slider" />
                        </label>
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
                      </div>
                      <label className="toggle-switch">
                        <input id="audioEnabled" type="checkbox" checked={settings.audioEnabled}
                          onChange={e=>setSettingValue("audioEnabled",e.target.checked)} />
                        <span className="slider" />
                      </label>
                    </div>

                    <div className="setting-row checkbox-row">
                      <div>
                        <label htmlFor="spokenConfirmations" style={{display:"block",fontWeight:700}}>Spoken Confirmations</label>
                        <span className="setting-sub">Announces each letter as you type it with your gloves</span>
                      </div>
                      <label className="toggle-switch">
                        <input id="spokenConfirmations" type="checkbox" checked={settings.spokenConfirmations}
                          onChange={e=>setSettingValue("spokenConfirmations",e.target.checked)} />
                        <span className="slider" />
                      </label>
                    </div>

                    {(settings.audioEnabled || settings.spokenConfirmations) && (
                      <div className="setting-row">
                        <label>Speech Speed</label>
                        <div className="speed-options" role="group" aria-label="Speech speed">
                          {["slow","normal","fast"].map(s=>(
                            <button key={s} type="button"
                              className={`speed-button ${settings.audioSpeed===s?"active":""}`}
                              aria-pressed={settings.audioSpeed===s}
                              onClick={()=>setSettingValue("audioSpeed",s)}>
                              {s[0].toUpperCase()+s.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="setting-row checkbox-row">
                      <label htmlFor="darkMode">Dark Mode</label>
                      <label className="toggle-switch">
                        <input id="darkMode" type="checkbox" checked={settings.darkMode}
                          onChange={e=>setSettingValue("darkMode",e.target.checked)} />
                        <span className="slider" />
                      </label>
                    </div>

                    <div className="setting-row checkbox-row">
                      <div>
                        <label htmlFor="highContrast" style={{display:"block",fontWeight:700}}>High Contrast</label>
                        <span className="setting-sub">Stronger borders and bolder colors for low vision</span>
                      </div>
                      <label className="toggle-switch">
                        <input id="highContrast" type="checkbox" checked={settings.highContrast}
                          onChange={e=>setSettingValue("highContrast",e.target.checked)} />
                        <span className="slider" />
                      </label>
                    </div>

                    <div className="setting-hint">
                      Keyboard shortcut: Alt + 1 through 6 jumps between pages.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="body">
          {/* SIDEBAR */}
          <aside className={`sidebar ${sidebarCollapsed?"collapsed":""}`} aria-label="Main navigation">
            <button
              className="collapse-button"
              aria-label={sidebarCollapsed?"Expand sidebar":"Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
              onClick={()=>setSidebarCollapsed(p=>!p)}
            >
              <span className={`collapse-arrow ${sidebarCollapsed?"collapsed":""}`} aria-hidden="true"><ChevronIcon /></span>
            </button>
            <nav aria-label="Page navigation">
              {navItems.map((item,idx)=>(
                <SidebarItem key={item.label} icon={item.icon} label={item.label}
                  active={activeTab===item.label} collapsed={sidebarCollapsed}
                  shortcut={`Alt+${idx+1}`} onClick={()=>setActiveTab(item.label)} />
              ))}
            </nav>
          </aside>

          {/* CONTENT */}
          <main className="content" id="main-content">
            {/* SR live region — always present, updated by learnMessage */}
            <div className="sr-live-region" aria-live="polite" aria-atomic="true">{learnMessage}</div>

            {/* HOME */}
            {activeTab==="Home" && (
              <>
                <section className="section-card hero-card" aria-labelledby="home-heading">
                  <p className="eyebrow">Audio-first braille note taker</p>
                  <h1 id="home-heading">{loadedNoteId ? "Editing Note" : "Home"}</h1>
                  <p className="support-text">
                    {loadedNoteId
                      ? "You are editing a saved note. Use your gloves to continue writing, then press Update Note to save your changes."
                      : "Type with your BrailLearn gloves and watch text appear. Play it back as audio, save it as a note, or export it."}
                  </p>
                  {loadedNoteId && (
                    <button className="action-button" style={{marginTop:12}}
                      onClick={()=>{setLoadedNoteId(null);setText("");resetVisuals();}}>
                      Cancel Edit
                    </button>
                  )}
                </section>

                <section className="section-card" aria-labelledby="current-note-heading">
                  <h2 id="current-note-heading" style={{marginBottom:14}}>Current Note</h2>
                  <div
                    className="text-display"
                    style={{fontSize:`${textSize}px`}}
                    aria-label={`Current note text: ${text || "empty"}`}
                    aria-live="polite"
                  >
                    <span className="typed-text">{text}</span>
                    <span className="cursor" aria-hidden="true" />
                  </div>
                  <div className="action-row" role="toolbar" aria-label="Note actions">
                    <button className="action-button primary"
                      onClick={()=>speakText(text||"There is no note text yet.",audioSpeed)}>
                      <VolumeIcon /> Play Audio
                    </button>
                    <button className="action-button" onClick={handleSaveNote}>
                      {loadedNoteId ? "Update Note" : "Save Note"}
                    </button>
                    <button className="action-button" onClick={exportNoteAsTxt}>Export .txt</button>
                    <button className="action-button" onClick={handleBackspace}>Backspace</button>
                    <button className="action-button" onClick={handleClear}>Clear</button>
                  </div>
                  <div className="status-chip-row" aria-label="Status">
                    <div className="status-chip"><strong>Last letter:</strong> {detectedLetter||"none"}</div>
                    <div className="status-chip"><strong>Hardware:</strong> {connected?"Connected":"Disconnected"}</div>
                    <div className="status-chip"><strong>Length:</strong> {text.length} chars</div>
                  </div>
                </section>

                <section className="section-card" aria-labelledby="preview-heading">
                  <h2 id="preview-heading" style={{marginBottom:8}}>Braille and Glove Preview</h2>
                  <p className="support-text" style={{marginBottom:14}}>Visual aid for instructors and demos.</p>
                  <BrailleHandsPreview brailleDots={brailleDots} fingers={fingers} />
                </section>
              </>
            )}

            {/* LEARN */}
            {activeTab==="Learn" && (
              <>
                <section className="section-card hero-card" aria-labelledby="learn-heading">
                  <p className="eyebrow">Practice and exploration</p>
                  <h1 id="learn-heading">Learn</h1>
                  <p className="support-text">
                    Practice mode gives you a target letter to press. Explore mode lets you freely discover what each pattern means.
                  </p>
                </section>

                <section className="section-card compact-card">
                  <div className="learn-topbar">
                    <div className="learn-mode-toggle" role="group" aria-label="Learning mode">
                      {["practice","explore"].map(m=>(
                        <button key={m}
                          className={`mode-button ${learnMode===m?"active":""}`}
                          aria-pressed={learnMode===m}
                          onClick={()=>{setLearnMode(m);setLearnCorrect(null);setLearnMessage(`${m[0].toUpperCase()+m.slice(1)} mode.`);}}>
                          {m[0].toUpperCase()+m.slice(1)}
                        </button>
                      ))}
                    </div>
                    {learnMode==="practice" && (
                      <div className="learn-select-group">
                        <label htmlFor="target-letter">Target letter:</label>
                        <select id="target-letter" value={targetLetter}
                          onChange={e=>{setTargetLetter(e.target.value);setLearnCorrect(null);setDetectedLetter("");resetVisuals();}}>
                          {LETTERS.map(l=><option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </section>

                <div className="learn-layout">
                  <section className="section-card" aria-labelledby="target-letter-heading">
                    <h2 id="target-letter-heading" style={{marginBottom:14}}>{learnMode==="practice"?"Target Letter":"Detected Letter"}</h2>
                    <div className="target-letter-box">
                      <div className="big-letter" aria-label={learnMode==="practice" ? `Target letter: ${targetLetter}` : `Detected letter: ${detectedLetter || "none"}`}>
                        {learnMode==="practice"?targetLetter:(detectedLetter||"none")}
                      </div>
                      <button className="action-button compact-button"
                        onClick={()=>speakText(learnMode==="practice"?`Target letter: ${targetLetter}`:(detectedLetter?`Detected: ${detectedLetter}`:"No letter detected yet"),audioSpeed)}>
                        <VolumeIcon /> Speak
                      </button>
                    </div>
                    {learnMode==="practice" ? (
                      <div className="tip-box">
                        <h3>Dot pattern for {targetLetter}</h3>
                        <p>Active dots: {LETTER_PATTERNS[targetLetter].map((on,i)=>on?i+1:null).filter(Boolean).join(", ")||"none"}</p>
                        <p>Press the matching finger combination on your gloves.</p>
                      </div>
                    ) : (
                      <div className="tip-box">
                        <h3>Explore Mode</h3>
                        <p>Press any finger combination on your gloves to discover what braille letter it produces.</p>
                      </div>
                    )}
                  </section>

                  <section className="section-card" aria-labelledby="feedback-heading">
                    <h2 id="feedback-heading" style={{marginBottom:14}}>Feedback</h2>
                    <div
                      className={`learn-feedback ${learnCorrect===true?"correct":learnCorrect===false?"incorrect":""}`}
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {learnMessage}
                    </div>
                    {learnMode==="practice" && (
                      <>
                        <div className="progress-wrap">
                          <div className="learn-progress">
                            <div className="learn-progress-bar" role="progressbar" aria-valuenow={completedLetters.length} aria-valuemin={0} aria-valuemax={26} aria-label="Letters mastered">
                              <div className="learn-progress-fill" style={{width:`${(completedLetters.length/26)*100}%`}} />
                            </div>
                            <span>{completedLetters.length} of 26 letters mastered</span>
                          </div>
                        </div>
                        <div className="learn-bottom-actions">
                          <button onClick={nextTargetLetter}>Next</button>
                          <button onClick={randomTargetLetter}>Random</button>
                          <button onClick={resetLearnProgress}>Reset to A</button>
                        </div>
                      </>
                    )}
                    <div className="status-chip-row" style={{marginTop:14}}>
                      <div className="status-chip"><strong>Hardware:</strong> {connected?"Connected":"Disconnected"}</div>
                      {detectedLetter && <div className="status-chip"><strong>Last input:</strong> {detectedLetter}</div>}
                    </div>
                  </section>
                </div>

                <section className="section-card compact-card" aria-labelledby="learn-preview-heading">
                  <h2 id="learn-preview-heading" style={{marginBottom:12}}>Braille and Glove Preview</h2>
                  <BrailleHandsPreview brailleDots={brailleDots} fingers={fingers} />
                </section>
              </>
            )}

            {/* NOTES */}
            {activeTab==="Notes" && (
              <section className="section-card" aria-labelledby="notes-heading">
                <div className="notes-header">
                  <div>
                    <h1 id="notes-heading" style={{marginBottom:4}}>Saved Notes</h1>
                    <p className="support-text">{notes.length} note{notes.length!==1?"s":""} · {deletedNotes.length} in trash</p>
                  </div>
                  <button className="action-button primary"
                    onClick={()=>{setLoadedNoteId(null);setText("");setActiveTab("Home");}}>
                    New Note
                  </button>
                </div>

                <div className="notes-toolbar">
                  <div className="notes-search">
                    <input type="search" placeholder="Search notes"
                      value={noteSearch} onChange={e=>setNoteSearch(e.target.value)}
                      className="search-input" aria-label="Search notes" />
                  </div>
                  <div className="notes-sort">
                    <label htmlFor="note-sort" className="sr-only">Sort notes</label>
                    <select id="note-sort" value={noteSort} onChange={e=>setNoteSort(e.target.value)}>
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="longest">Longest</option>
                      <option value="shortest">Shortest</option>
                    </select>
                  </div>
                </div>

                {notes.length===0&&!noteSearch ? (
                  <div className="notes-empty">
                    <p>No notes yet.</p>
                    <p className="support-text">Go to Home, type something with your gloves, then press Save Note.</p>
                  </div>
                ) : filteredNotes.length===0&&noteSearch ? (
                  <div className="notes-empty" role="status"><p>No notes match "{noteSearch}"</p></div>
                ) : (
                  <ul className="notes-list" aria-label="Saved notes">
                    {filteredNotes.map(note=>(
                      <li key={note.id} className={`note-item ${editingId===note.id?"editing":""}`}>
                        {editingId===note.id ? (
                          <div className="note-edit-area">
                            <label htmlFor={`edit-note-${note.id}`} className="sr-only">Edit note text</label>
                            <textarea
                              id={`edit-note-${note.id}`}
                              className="note-textarea"
                              value={editText}
                              onChange={e=>setEditText(e.target.value)}
                              rows={5}
                            />
                            <div className="note-edit-actions">
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
                              <button className="note-btn" onClick={()=>speakText(note.text,audioSpeed)} aria-label={`Read aloud: ${note.text.slice(0,30)}`}><VolumeIcon /></button>
                              <button className="note-btn" onClick={()=>loadNoteIntoEditor(note)} aria-label="Open note in editor"><EditOpenIcon /></button>
                              <button className="note-btn" onClick={()=>startEditingNote(note)} aria-label="Quick edit note"><PencilIcon /></button>
                              <button className="note-btn danger" onClick={()=>deleteNote(note.id)} aria-label="Move note to trash"><TrashIcon /></button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {deletedNotes.length > 0 && (
                  <div className="trash-section" aria-labelledby="trash-heading">
                    <div className="trash-header">
                      <h2 id="trash-heading">Trash ({deletedNotes.length})</h2>
                      <button className="empty-trash-btn" onClick={emptyTrash}>Empty Trash</button>
                    </div>
                    <ul className="notes-list trash-list" aria-label="Deleted notes">
                      {deletedNotes.map(note=>(
                        <li key={note.id} className="note-item">
                          <div className="note-content">
                            <p className="note-text">{note.text}</p>
                            <span className="note-date">Deleted: {note.deletedAt}</span>
                          </div>
                          <div className="note-actions">
                            <button className="note-btn" onClick={()=>restoreNote(note.id)} aria-label="Restore note"><RestoreIcon /></button>
                            <button className="note-btn danger" onClick={()=>permanentlyDeleteNote(note.id)} aria-label="Delete note permanently"><TrashIcon /></button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* HISTORY */}
            {activeTab==="History" && (
              <section className="section-card" aria-labelledby="history-heading">
                <h1 id="history-heading" style={{marginBottom:6}}>History</h1>
                <p className="support-text">Track your note entries and practice attempts.</p>
                <div className="history-sections">
                  {history.practice.length > 0 && (
                    <div style={{display:"flex",gap:14,flexWrap:"wrap"}} role="list" aria-label="Practice statistics">
                      {[
<<<<<<< HEAD
                        [history.practice.filter(p=>p.type==="correct").length,"Correct"],
                        [history.practice.filter(p=>p.type==="incorrect").length,"Incorrect"],
                        [Math.round(history.practice.filter(p=>p.type==="correct").length/Math.max(history.practice.length,1)*100)+"%","Accuracy"],
                        [`${completedLetters.length}/26`,"Mastered"],
                      ].map(([val,lab])=>(
                        <div key={lab} className="stat-box" style={{flex:"1 1 90px"}} role="listitem">
                          <span className="stat-value" aria-label={`${lab}: ${val}`}>{val}</span>
                          <span className="stat-label" aria-hidden="true">{lab}</span>
=======
                        [history.practice.filter(p=>p.type==="correct").length,   "Correct"],
                        [history.practice.filter(p=>p.type==="incorrect").length, "Incorrect"],
                        [Math.round(history.practice.filter(p=>p.type==="correct").length/Math.max(history.practice.length,1)*100)+"%", "Accuracy"],
                        [`${completedLetters.length}/26`, "Mastered"],
                      ].map(([val,lab]) => (
                        <div key={lab} className="stat-box" style={{flex:"1 1 100px"}}>
                          <span className="stat-value">{val}</span>
                          <span className="stat-label">{lab}</span>
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
                        </div>
                      ))}
                    </div>
                  )}
<<<<<<< HEAD
                  <div className="history-section" aria-labelledby="recent-notes-heading">
                    <div className="history-section-header" id="recent-notes-heading"><NotesIcon /> Recent Notes</div>
                    {history.notes.length===0 ? <p className="history-empty">No notes saved yet.</p> : (
                      <ul className="history-list" aria-label="Recent notes history">
                        {history.notes.slice(0,10).map((item,i)=>(
=======

                  <div className="history-section">
                    <div className="history-section-header"><NotesIcon /> Recent Notes</div>
                    {history.notes.length === 0 ? (
                      <p className="history-empty">No notes saved yet.</p>
                    ) : (
                      <ul className="history-list">
                        {history.notes.slice(0,10).map((item,i) => (
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
                          <li key={i} className="history-item">
                            <span className="history-icon note-hi" aria-hidden="true">N</span>
                            <span className="history-text">{item.text}</span>
                            <span className="history-time">{item.createdAt}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
<<<<<<< HEAD
                  <div className="history-section" aria-labelledby="practice-history-heading">
                    <div className="history-section-header" id="practice-history-heading"><LearnIcon /> Practice Attempts</div>
                    {history.practice.length===0 ? <p className="history-empty">No practice attempts yet.</p> : (
                      <ul className="history-list" aria-label="Practice history">
                        {history.practice.slice(0,10).map((item,i)=>(
=======

                  <div className="history-section">
                    <div className="history-section-header"><LearnIcon /> Practice Attempts</div>
                    {history.practice.length === 0 ? (
                      <p className="history-empty">No practice attempts yet.</p>
                    ) : (
                      <ul className="history-list">
                        {history.practice.slice(0,10).map((item,i) => (
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
                          <li key={i} className={`history-item ${item.type}`}>
                            <span className={`history-icon ${item.type==="correct"?"correct-hi":"incorrect-hi"}`} aria-hidden="true">
                              {item.type==="correct"?"+":"x"}
                            </span>
                            <span className="history-text">Entered <strong>{item.letter}</strong>, target was {item.target}</span>
                            <span className="history-time">{item.createdAt}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="history-actions">
                  {confirmClearHistory ? (
                    <div className="confirm-row" role="alertdialog" aria-label="Confirm clear history">
                      <span>Clear all history?</span>
                      <button className="action-button" onClick={()=>{setHistory({notes:[],practice:[],sessions:[]});setConfirmClearHistory(false);}}>Yes, clear</button>
                      <button className="action-button" onClick={()=>setConfirmClearHistory(false)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="action-button" onClick={()=>setConfirmClearHistory(true)}>
                      Clear History
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* SENSOR DATA */}
            {activeTab==="Sensor Data" && (
              <div className="sensor-page">
                <section className="section-card hero-card" aria-labelledby="sensor-heading">
                  <p className="eyebrow">Hardware diagnostics</p>
                  <h1 id="sensor-heading">Sensor Data</h1>
                  <p className="support-text">Live readings from your six fingertip sensors. Check connection status and troubleshoot issues here.</p>
                </section>

<<<<<<< HEAD
                <section className="section-card" aria-labelledby="status-heading">
                  <h2 id="status-heading" style={{marginBottom:14}}>Status</h2>
                  <ul className="trouble-list" aria-label="Connection status">
                    {troubleshootItems.map((item,i)=>(
=======
                <section className="section-card">
                  <h2 style={{marginBottom:14}}>Status &amp; Troubleshooting</h2>
                  <ul className="trouble-list">
                    {troubleshootItems.map((item, i) => (
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
                      <li key={i} className={`trouble-item ${item.kind==="ok"?"ok-item":item.kind==="warn"?"warn-item":"err-item"}`}>
                        <span className={`trouble-badge ${item.kind}`}>{item.label}</span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>

<<<<<<< HEAD
                <section className="section-card" aria-labelledby="live-sensor-heading">
                  <h2 id="live-sensor-heading" style={{marginBottom:14}}>Live Sensor Readings</h2>
                  <div className="sensor-grid" role="list" aria-label="Finger sensor readings">
                    {FINGER_NAMES.map((name,i)=>{
                      const pct=Math.round(sensorValues[i]*100);
=======
                <section className="section-card">
                  <h2 style={{marginBottom:14}}>Live Sensor Readings</h2>
                  <div className="sensor-grid">
                    {FINGER_NAMES.map((name, i) => {
                      const pct    = Math.round(sensorValues[i] * 100);
                      const active = pct > 10;
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
                      return (
                        <div key={i} className={`sensor-finger-card ${pct>10?"active":""}`} role="listitem" aria-label={`${name}: ${pct}%`}>
                          <div className="sensor-finger-label">{i<3?"Left Hand":"Right Hand"}</div>
                          <div className="sensor-finger-name">{name.split("-")[1]}</div>
<<<<<<< HEAD
                          <div className="sensor-bar-track" role="presentation">
                            <div className="sensor-bar-fill" style={{width:`${pct}%`,background:FINGER_COLORS[i]}} />
=======
                          <div className="sensor-bar-track">
                            <div className="sensor-bar-fill" style={{width:`${pct}%`, background:FINGER_COLORS[i]}} />
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
                          </div>
                          <div className="sensor-value" aria-hidden="true">{pct}<span className="sensor-pct">%</span></div>
                        </div>
                      );
                    })}
                  </div>
                </section>

<<<<<<< HEAD
                <section className="section-card" aria-labelledby="chart-heading">
                  <h2 id="chart-heading" style={{marginBottom:14}}>Input Over Time</h2>
=======
                <section className="section-card">
                  <h2 style={{marginBottom:14}}>Input Over Time</h2>
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
                  <div className="sensor-chart-wrap">
                    <SensorChart history={sensorHistory} />
                  </div>
                  <div className="chart-legend" aria-label="Chart legend">
                    {FINGER_NAMES.map((name,i)=>(
                      <div key={i} className="chart-legend-item">
                        <div className="legend-dot" style={{background:FINGER_COLORS[i]}} aria-hidden="true" />
                        {name}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="section-card">
                  <button
                    className="adv-toggle"
                    onClick={()=>setShowAdvanced(p=>!p)}
                    aria-expanded={showAdvanced}
                    aria-controls="adv-section"
                  >
                    <span>Advanced diagnostics</span>
                    <span className={`adv-chevron ${showAdvanced?"open":""}`} aria-hidden="true"><ChevronDownIcon /></span>
                  </button>
                  {showAdvanced && (
                    <div id="adv-section" className="adv-section">
                      <span className="adv-label">Connection Info</span>
                      <div className="diag-grid">
<<<<<<< HEAD
                        {[
                          ["WebSocket",   connected?"Connected":"Disconnected", connected?"ok":"err"],
                          ["Latency",     wsLatency!==null?`${wsLatency} ms`:"no data", wsLatency===null?"warn":wsLatency<50?"ok":"warn"],
                          ["Last packet", timeSincePacket!==null?`${timeSincePacket}s ago`:"none", timeSincePacket===null?"warn":timeSincePacket<5?"ok":"warn"],
                          ["Server",      "ws://localhost:5001", ""],
                        ].map(([label,val,cls])=>(
                          <div key={label} className="diag-row">
                            <span className="diag-label">{label}</span>
                            <span className={`diag-value ${cls}`}>{val}</span>
                          </div>
                        ))}
=======
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
                          <span className="diag-value">ws://192.168.1.25:5001</span>
                        </div>
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
                      </div>
                      <span className="adv-label" style={{display:"block",marginTop:16}}>Raw ADC Values (0 to 4095)</span>
                      <div className="diag-grid">
                        {FINGER_NAMES.map((name,i)=>(
                          <div key={i} className="diag-row">
                            <span className="diag-label">{name}</span>
                            <span className="diag-value">{sensorAdcValues[i]??0}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ABOUT */}
            {activeTab==="About" && (
              <div className="about-page">
                <section className="section-card hero-card" aria-labelledby="about-heading">
                  <p className="eyebrow">UT Dallas Engineering Project</p>
                  <h1 id="about-heading">About BrailLearn</h1>
                  <p className="support-text">
                    BrailLearn is a wearable braille input glove designed to help people who are
                    blind, visually impaired, or nonverbal communicate more easily. Each finger has
                    a force-sensitive resistor that detects pressure. Different finger combinations
                    map to braille letters, translated into text and audio output in real time.
                  </p>
                </section>

                <section className="section-card" aria-labelledby="how-it-works-heading">
                  <h2 id="how-it-works-heading" style={{marginBottom:12}}>How It Works</h2>
                  <p className="support-text" style={{marginBottom:18}}>
                    The glove has six FSR sensors on the thumb, middle, and ring finger of each
                    hand. Pressing different combinations produces a 6-bit pattern that maps to a
                    braille character. An ESP32 microcontroller reads the sensors and streams data
                    over WebSocket to this dashboard.
                  </p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}} role="list" aria-label="Technical specifications">
                    {[
<<<<<<< HEAD
                      ["Hardware",   "6 FSR sensors, ESP32 microcontroller, lightweight gloves"],
                      ["Connection", "WebSocket streaming at ws://localhost:5001"],
                      ["Output",     "Text display and speech synthesis for audio feedback"],
                    ].map(([label,desc])=>(
                      <div key={label} className="stat-box" style={{alignItems:"flex-start",gap:6,padding:16}} role="listitem">
=======
                      ["🧤","Hardware","6 FSR sensors, ESP32, lightweight gloves"],
                      ["📡","Connection","WebSocket at ws://192.168.1.25:5001"],
                      ["🔊","Output","Text display + speech synthesis"],
                    ].map(([icon,label,desc]) => (
                      <div key={label} className="stat-box" style={{alignItems:"flex-start",gap:6,padding:"16px"}}>
                        <span style={{fontSize:"1.5rem"}}>{icon}</span>
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
                        <span className="stat-label">{label}</span>
                        <span style={{fontSize:".9rem",lineHeight:1.5}}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="section-card" aria-labelledby="team-heading">
                  <h2 id="team-heading" style={{marginBottom:14}}>Meet the Team</h2>
                  <div className="team-grid">
                    {[
<<<<<<< HEAD
                      {name:"Zubiyaa Khan",      role:"Computer Science",      year:"Senior",   bio:"Passionate about hardware and software integration. Interested in accessibility technology and creating solutions that improve lives."},
                      {name:"Presley Churchman", role:"Electrical Engineering", year:"Freshman", bio:"Focused on sensor circuit implementation and the firmware and software overlap. Plays for the UT Dallas women's tennis team."},
                      {name:"Kasish Jain",       role:"Computer Engineering",  year:"Sophomore",bio:"Interested in embedded systems and biomedical applications. Explores how hardware and software intersect for human-centered design."},
                      {name:"Jayne McGovern",    role:"Mechanical Engineering", year:"Freshman", bio:"Focused on sensors and ergonomics. Goals include better cross-discipline coordination and deeper knowledge of programming."},
                      {name:"Paris Ngo",         role:"Mechanical Engineering", year:"Junior",   bio:"Primary interests in medical device development and automotive design. Developing technical and hands-on skills in both areas."},
                      {name:"Melissa Manandhar", role:"Biomedical Engineering", year:"Freshman", bio:"Interested in developing accessible medical devices and the integration of technology with the human body."},
                    ].map(m=>(
=======
                      { name:"Zubiyaa Khan",      role:"CS Lead",                bio:"Senior in CS, passionate about hardware/software integration and accessibility technology." },
                      { name:"Presley Churchman", role:"Electrical Engineering", bio:"Freshman EE focused on sensor circuits and the firmware/software overlap. UT Dallas tennis team." },
                      { name:"Kasish Jain",        role:"Computer Engineering",  bio:"Sophomore CE interested in embedded systems and biomedical applications." },
                      { name:"Jayne McGovern",     role:"Mechanical Engineering", bio:"Freshman ME focused on sensors, ergonomics, and cross-discipline coordination." },
                      { name:"Paris Ngo",          role:"Mechanical Engineering", bio:"Junior ME with interests in medical devices and automotive design." },
                      { name:"Melissa Manandhar",  role:"Biomedical Engineering", bio:"Freshman BME focused on accessible medical devices and human-technology integration." },
                    ].map(m => (
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
                      <div key={m.name} className="team-card">
                        <div className="team-avatar" aria-hidden="true">
                          {m.name.split(" ").map(w=>w[0]).join("")}
                        </div>
                        <div className="team-name">{m.name}</div>
                        <div className="team-role">{m.year} · {m.role}</div>
                        <div className="team-bio">{m.bio}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="section-card">
                  <button
                    className="adv-toggle"
                    onClick={()=>setShowRefs(p=>!p)}
                    aria-expanded={showRefs}
                    aria-controls="refs-list"
                  >
                    <span>References (6)</span>
                    <span className={`adv-chevron ${showRefs?"open":""}`} aria-hidden="true"><ChevronDownIcon /></span>
                  </button>
                  {showRefs && (
                    <ul id="refs-list" className="cite-list" style={{marginTop:14}} aria-label="References">
                      {[
                        "CDC. (2024). Fast facts: Vision loss. cdc.gov",
                        "McDonnall et al. (2025). Factors associated with proficient Braille skills in adults. JVIB, 119(2).",
                        "Iowa Department for the Blind. How to read and write braille. blind.iowa.gov",
                        "Vision IP. (2025). The challenges of learning braille as an adult. visionip.org",
                        "DLSU Research Congress. (2021). Braille communication devices proceedings.",
                        "Dolphin et al. (2024). Information accessibility in the form of braille. IEEE OJEMB, 5, 205-209.",
                      ].map((c,i)=><li key={i} className="cite-item">{c}</li>)}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ─── SENSOR CHART ─────────────────────────────────────── */
function SensorChart({ history }) {
  const W=800,H=160,PAD=10;
  const maxLen=history.reduce((m,h)=>Math.max(m,h.length),0);
  return (
<<<<<<< HEAD
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none"
      role="img" aria-label="Sensor input history chart">
      <title>Sensor input over time for all six fingers</title>
      {[0.25,0.5,0.75,1].map(y=>(
        <line key={y} x1={PAD} y1={H-y*(H-PAD*2)-PAD} x2={W-PAD} y2={H-y*(H-PAD*2)-PAD}
          stroke="var(--border-col)" strokeWidth="1" opacity="0.4"/>
=======
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
      {[0.25,0.5,0.75,1].map(y => (
        <line key={y} x1={PAD} y1={H - y*(H-PAD*2) - PAD} x2={W-PAD} y2={H - y*(H-PAD*2) - PAD}
          stroke="var(--border-col)" strokeWidth="1" opacity="0.5" />
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
      ))}
      {history.map((vals,fi)=>{
        if(vals.length<2) return null;
        const pts=vals.map((v,i)=>{
          const x=PAD+(i/(Math.max(maxLen,1)-1))*(W-PAD*2);
          const y=H-PAD-v*(H-PAD*2);
          return `${x},${y}`;
        }).join(" ");
        return <polyline key={fi} points={pts} fill="none" stroke={FINGER_COLORS[fi]} strokeWidth="2.5" opacity="0.9" strokeLinejoin="round"/>;
      })}
      {maxLen===0&&(
        <text x={W/2} y={H/2} textAnchor="middle" dominantBaseline="middle" fill="var(--text-muted)" fontSize="14">
          Waiting for sensor data
        </text>
      )}
    </svg>
  );
}

/* ─── BRAILLE + HANDS ──────────────────────────────────── */
function BrailleHandsPreview({ brailleDots, fingers }) {
  return (
    <div className="bottom-row">
      <section className="braille-panel" aria-label="Braille cell display">
        <div className="braille-panel-header" aria-hidden="true">Braille Cell</div>
        <div className="braille-grid" role="img" aria-label={`Braille cell: dots ${brailleDots.map((a,i)=>a?i+1:null).filter(Boolean).join(", ")||"none"} active`}>
          {brailleDots.map((active,i)=>(
            <div key={i} className="braille-cell">
              <div className={`braille-dot ${active?"active":""}`} />
            </div>
          ))}
        </div>
      </section>
      <section className="hands-panel" aria-label="Glove finger display">
        <div className="hands-header" aria-hidden="true">
          <span className="hands-side-label">Left Hand</span>
          <span className="hands-side-label">Right Hand</span>
        </div>
        <div className="hands-body">
          {[
<<<<<<< HEAD
            {side:"left", cols:["Thumb","Middle","Ring"],vals:[fingers.left.thumb,fingers.left.middle,fingers.left.ring]},
            null,
            {side:"right",cols:["Thumb","Middle","Ring"],vals:[fingers.right.thumb,fingers.right.middle,fingers.right.ring]},
          ].map((col,i)=>col===null
            ?<div key="div" className="hand-divider" aria-hidden="true"/>
            :(
=======
            { side:"left",  cols:["Thumb","Middle","Ring"], vals:[fingers.left.thumb,  fingers.left.middle,  fingers.left.ring]  },
            null,
            { side:"right", cols:["Thumb","Middle","Ring"], vals:[fingers.right.thumb, fingers.right.middle, fingers.right.ring] },
          ].map((col, i) => col === null
            ? <div key="div" className="hand-divider" />
            : (
>>>>>>> fcfb7ff3cc26947f6733f4adc180ec3d05346db0
              <div key={col.side} className="hand-column">
                <div className="finger-name-row" aria-hidden="true">{col.cols.map(c=><span key={c}>{c}</span>)}</div>
                <div className="finger-icon-row">
                  {col.vals.map((active,j)=>(
                    <FingerSymbol key={j} active={active} label={`${col.side} ${col.cols[j]}: ${active?"pressed":"not pressed"}`} />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}

/* ─── SIDEBAR ITEM ─────────────────────────────────────── */
function SidebarItem({ icon, label, active, collapsed, shortcut, onClick }) {
  return (
    <button
      className={`nav-item ${active?"active":""} ${collapsed?"collapsed":""}`}
      onClick={onClick}
      aria-current={active?"page":undefined}
      aria-label={`${label} (${shortcut})`}
      title={shortcut}
    >
      <span className="nav-icon" aria-hidden="true">{icon}</span>
      {!collapsed && <span className="nav-label" aria-hidden="true">{label}</span>}
    </button>
  );
}

/* ─── ICONS ────────────────────────────────────────────── */
function FingerSymbol({ active, label }) {
  return (
    <div className={`finger-symbol ${active?"active":""}`} aria-label={label}>
      <svg viewBox="0 0 64 64" className="finger-svg" aria-hidden="true" focusable="false">
        <path d="M24 50V23c0-2 1.6-3.5 3.5-3.5S31 21 31 23v11h1V18c0-2 1.6-3.5 3.5-3.5S39 16 39 18v16h1V21c0-2 1.6-3.5 3.5-3.5S47 19 47 21v18c0 7-5.8 13-13 13h-2c-4.7 0-8-1.9-10.5-5.7l-4.4-6.8c-1-1.5-.6-3.6.9-4.6 1.4-.9 3.3-.6 4.4.7L24 39V23"/>
      </svg>
    </div>
  );
}
function HomeIcon(){return<svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true" focusable="false"><path d="M4 11.5 12 5l8 6.5v7.5a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z"/></svg>;}
function LearnIcon(){return<svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true" focusable="false"><path d="M12 5 3 9.5 12 14l7-3.5V17h2V9.5zM6 12.2V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.8L12 15z"/></svg>;}
function HistoryIcon(){return<svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true" focusable="false"><path d="M12 5a7 7 0 1 1-6.3 4H3l3.2-3.2L9.5 9H7.8A5 5 0 1 0 12 7v5l4 2-.8 1.8L10 13V5z"/></svg>;}
function SensorIcon(){return<svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true" focusable="false"><path d="M3 18h2v-6H3zm4 0h2V6H7zm4 0h2v-3h-2zm4 0h2V9h-2zm4 0h2v-9h-2z"/></svg>;}
function InfoIcon(){return<svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true" focusable="false"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 7h2V7h-2zm0 8h2v-6h-2z"/></svg>;}
function NotesIcon(){return<svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true" focusable="false"><path d="M6 3h9l3 3v15H6zM14 3v4h4M8 10h8M8 14h8M8 18h5"/></svg>;}
function GearIcon(){return<svg viewBox="0 0 24 24" className="gear-svg" aria-hidden="true" focusable="false"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/></svg>;}
function VolumeIcon(){return<svg viewBox="0 0 24 24" className="volume-svg" aria-hidden="true" focusable="false"><path d="M5 10h4l5-4v12l-5-4H5zm11.5 2a4.5 4.5 0 0 0-2.2-3.9v7.8a4.5 4.5 0 0 0 2.2-3.9zm1.8 0c0 3-1.7 5.6-4.2 6.9v-2.2a5 5 0 0 0 0-9.4V5.1c2.5 1.3 4.2 3.9 4.2 6.9z"/></svg>;}
function CloseIcon(){return<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12"/></svg>;}
function ChevronIcon(){return<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M15 18 9 12l6-6"/></svg>;}
function ChevronDownIcon(){return<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>;}
function PencilIcon(){return<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>;}
function TrashIcon(){return<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>;}
function EditOpenIcon(){return<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>;}
function RestoreIcon(){return<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>;}
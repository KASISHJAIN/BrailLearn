import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const LETTER_PATTERNS = {
  A: [true, false, false, false, false, false],
  B: [true, true, false, false, false, false],
  C: [true, false, false, true, false, false],
  D: [true, false, false, true, true, false],
  E: [true, false, false, false, true, false],
  F: [true, true, false, true, false, false],
  G: [true, true, false, true, true, false],
  H: [true, true, false, false, true, false],
  I: [false, true, false, true, false, false],
  J: [false, true, false, true, true, false],
  K: [true, false, true, false, false, false],
  L: [true, true, true, false, false, false],
  M: [true, false, true, true, false, false],
  N: [true, false, true, true, true, false],
  O: [true, false, true, false, true, false],
  P: [true, true, true, true, false, false],
  Q: [true, true, true, true, true, false],
  R: [true, true, true, false, true, false],
  S: [false, true, true, true, false, false],
  T: [false, true, true, true, true, false],
  U: [true, false, true, false, false, true],
  V: [true, true, true, false, false, true],
  W: [false, true, false, true, true, true],
  X: [true, false, true, true, false, true],
  Y: [true, false, true, true, true, true],
  Z: [true, false, true, false, true, true],
};

const LETTERS = Object.keys(LETTER_PATTERNS);

const DEFAULT_FINGERS = {
  left: { thumb: false, middle: false, ring: false },
  right: { thumb: false, middle: false, ring: false },
};

const DEFAULT_SETTINGS = {
  textSize: 56,
  audioEnabled: true,
  audioSpeed: "normal",
  darkMode: false,
  highContrast: false,
  spokenConfirmations: true,
};

function App() {
  const [activeTab, setActiveTab] = useState("Home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [text, setText] = useState("");
  const [brailleDots, setBrailleDots] = useState([false, false, false, false, false, false]);
  const [fingers, setFingers] = useState(DEFAULT_FINGERS);

  const [notes, setNotes] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const [connected, setConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsContainerRef = useRef(null);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [learnMode, setLearnMode] = useState("practice");
  const [targetLetter, setTargetLetter] = useState("A");
  const [detectedLetter, setDetectedLetter] = useState("");
  const [learnMessage, setLearnMessage] = useState("Waiting for glove input.");
  const [learnCorrect, setLearnCorrect] = useState(null);
  const [completedLetters, setCompletedLetters] = useState([]);
  const [lastSpokenMessage, setLastSpokenMessage] = useState("");

  const navItems = useMemo(
    () => [
      { label: "Home", icon: <HomeIcon /> },
      { label: "Learn", icon: <LearnIcon /> },
      { label: "Notes", icon: <NotesIcon /> },
      { label: "History", icon: <HistoryIcon /> },
      { label: "Sensor Data", icon: <SensorIcon /> },
      { label: "About", icon: <InfoIcon /> },
    ],
    []
  );

  useEffect(() => {
    const savedNotes = localStorage.getItem("braille-notes");
    if (savedNotes) {
      try {
        setNotes(JSON.parse(savedNotes));
      } catch (error) {
        console.error("Could not load notes.", error);
      }
    }

    const savedSettings = localStorage.getItem("braille-settings");
    if (savedSettings) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
      } catch (error) {
        console.error("Could not load settings.", error);
      }
    }

    const savedProgress = localStorage.getItem("braille-learn-progress");
    if (savedProgress) {
      try {
        const parsed = JSON.parse(savedProgress);
        setCompletedLetters(parsed.completedLetters || []);
      } catch (error) {
        console.error("Could not load learn progress.", error);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("braille-notes", JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem("braille-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(
      "braille-learn-progress",
      JSON.stringify({ completedLetters })
    );
  }, [completedLetters]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        settingsContainerRef.current &&
        !settingsContainerRef.current.contains(event.target)
      ) {
        setShowSettings(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!settings.audioEnabled) return;
    if (!settings.spokenConfirmations) return;
    if (!lastSpokenMessage) return;

    speakText(lastSpokenMessage, settings.audioSpeed);
  }, [lastSpokenMessage, settings.audioEnabled, settings.audioSpeed, settings.spokenConfirmations]);

  useEffect(() => {
    let ws;

    try {
      ws = new WebSocket("ws://localhost:5001");

      ws.addEventListener("open", () => {
        setConnected(true);
      });

      ws.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "status") {
            setConnected(!!data.connected);
            return;
          }

          if (data.type === "letter" && data.letter) {
            const incomingLetter = String(data.letter).toUpperCase();
            handleIncomingLetter(incomingLetter);
            return;
          }

          if (data.type === "pattern" && Array.isArray(data.pattern) && data.pattern.length === 6) {
            handleIncomingPattern(data.pattern);
            return;
          }
        } catch (error) {
          console.error("Bad websocket message:", error);
        }
      });

      ws.addEventListener("close", () => {
        setConnected(false);
      });

      ws.addEventListener("error", () => {
        setConnected(false);
      });
    } catch (error) {
      setConnected(false);
    }

    return () => {
      if (ws) {
        try {
          ws.close();
        } catch (error) {
          console.error("Error closing websocket:", error);
        }
      }
    };
  }, [learnMode, targetLetter, completedLetters, settings.audioEnabled, settings.spokenConfirmations]);

  const darkMode = settings.darkMode;
  const textSize = settings.textSize;
  const audioEnabled = settings.audioEnabled;
  const audioSpeed = settings.audioSpeed;

  function speakText(message, speed = "normal") {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);

    if (speed === "slow") utterance.rate = 0.8;
    if (speed === "normal") utterance.rate = 1;
    if (speed === "fast") utterance.rate = 1.25;

    window.speechSynthesis.speak(utterance);
  }

  function resetVisuals() {
    setBrailleDots([false, false, false, false, false, false]);
    setFingers(DEFAULT_FINGERS);
  }

  function applyPatternToHands(pattern) {
    setFingers({
      left: {
        ring: pattern[0],
        middle: pattern[1],
        thumb: pattern[2],
      },
      right: {
        ring: pattern[3],
        middle: pattern[4],
        thumb: pattern[5],
      },
    });
  }

  function getLetterFromPattern(pattern) {
    for (const [letter, value] of Object.entries(LETTER_PATTERNS)) {
      if (JSON.stringify(value) === JSON.stringify(pattern)) {
        return letter;
      }
    }
    return null;
  }

  function handleLetterInput(letter, appendToText = true) {
    const pattern = LETTER_PATTERNS[letter];
    if (!pattern) return;

    if (appendToText) {
      setText((prev) => prev + letter);
    }

    setDetectedLetter(letter);
    setBrailleDots(pattern);
    applyPatternToHands(pattern);

    if (settings.spokenConfirmations && audioEnabled) {
      setLastSpokenMessage(`Entered ${letter}`);
    }
  }

  function handleIncomingPattern(pattern) {
    const detected = getLetterFromPattern(pattern);

    setBrailleDots(pattern);
    applyPatternToHands(pattern);

    if (detected) {
      handleIncomingLetter(detected, pattern);
    } else {
      setDetectedLetter("?");
      setLearnCorrect(false);
      setLearnMessage("Pattern received, but it does not match a supported letter.");

      if (learnMode === "explore" && settings.spokenConfirmations && audioEnabled) {
        setLastSpokenMessage("Unknown pattern");
      }
    }
  }

  function handleIncomingLetter(letter, incomingPattern) {
    const pattern = incomingPattern || LETTER_PATTERNS[letter];
    if (!pattern) return;

    setDetectedLetter(letter);
    setBrailleDots(pattern);
    applyPatternToHands(pattern);

    if (activeTab === "Home") {
      setText((prev) => prev + letter);

      if (settings.spokenConfirmations && audioEnabled) {
        setLastSpokenMessage(`Entered ${letter}`);
      }
      return;
    }

    if (activeTab === "Learn") {
      if (learnMode === "practice") {
        const isCorrect = letter === targetLetter;

        if (isCorrect) {
          setLearnCorrect(true);
          setLearnMessage(`Correct. The gloves entered ${letter}.`);

          if (!completedLetters.includes(letter)) {
            setCompletedLetters((prev) => [...prev, letter]);
          }

          if (settings.spokenConfirmations && audioEnabled) {
            setLastSpokenMessage(`Correct. ${letter}`);
          }
        } else {
          setLearnCorrect(false);
          setLearnMessage(`Not quite. You entered ${letter}, but the target is ${targetLetter}.`);

          if (settings.spokenConfirmations && audioEnabled) {
            setLastSpokenMessage(`Incorrect. You entered ${letter}`);
          }
        }
      } else {
        setLearnCorrect(null);
        setLearnMessage(`Explore mode detected ${letter}.`);

        if (settings.spokenConfirmations && audioEnabled) {
          setLastSpokenMessage(`Detected ${letter}`);
        }
      }
    }
  }

  function handleBackspace() {
    setText((prev) => prev.slice(0, -1));
    if (settings.spokenConfirmations && audioEnabled) {
      setLastSpokenMessage("Backspace");
    }
  }

  function handleClear() {
    setText("");
    setDetectedLetter("");
    resetVisuals();

    if (settings.spokenConfirmations && audioEnabled) {
      setLastSpokenMessage("Cleared note");
    }
  }

  function handleSaveNote() {
    if (!text.trim()) return;

    const newNote = {
      id: Date.now(),
      text: text.trim(),
      createdAt: new Date().toLocaleString(),
    };

    setNotes((prev) => [newNote, ...prev]);
    setText("");
    setDetectedLetter("");
    resetVisuals();

    if (settings.spokenConfirmations && audioEnabled) {
      setLastSpokenMessage("Note saved");
    }
  }

  function exportNoteAsTxt() {
    if (!text.trim()) return;

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "braille-note.txt";
    link.click();

    URL.revokeObjectURL(url);

    if (settings.spokenConfirmations && audioEnabled) {
      setLastSpokenMessage("Note exported");
    }
  }

  function startEditingNote(note) {
    setEditingId(note.id);
    setEditText(note.text);
  }

  function saveEditedNote() {
    if (!editText.trim()) return;

    setNotes((prev) =>
      prev.map((note) =>
        note.id === editingId ? { ...note, text: editText.trim() } : note
      )
    );

    setEditingId(null);
    setEditText("");

    if (settings.spokenConfirmations && audioEnabled) {
      setLastSpokenMessage("Note updated");
    }
  }

  function cancelEditing() {
    setEditingId(null);
    setEditText("");
  }

  function deleteNote(noteId) {
    setNotes((prev) => prev.filter((note) => note.id !== noteId));

    if (editingId === noteId) {
      cancelEditing();
    }

    if (settings.spokenConfirmations && audioEnabled) {
      setLastSpokenMessage("Note deleted");
    }
  }

  function nextTargetLetter() {
    const currentIndex = LETTERS.indexOf(targetLetter);
    const nextIndex = (currentIndex + 1) % LETTERS.length;
    const nextLetter = LETTERS[nextIndex];

    setTargetLetter(nextLetter);
    setLearnCorrect(null);
    setLearnMessage(`New target letter: ${nextLetter}`);
    setDetectedLetter("");
    resetVisuals();

    if (settings.spokenConfirmations && audioEnabled) {
      setLastSpokenMessage(`New target letter ${nextLetter}`);
    }
  }

  function randomTargetLetter() {
    const randomLetter = LETTERS[Math.floor(Math.random() * LETTERS.length)];

    setTargetLetter(randomLetter);
    setLearnCorrect(null);
    setLearnMessage(`Random target letter: ${randomLetter}`);
    setDetectedLetter("");
    resetVisuals();

    if (settings.spokenConfirmations && audioEnabled) {
      setLastSpokenMessage(`Random target letter ${randomLetter}`);
    }
  }

  function resetLearnProgress() {
    setCompletedLetters([]);
    setLearnCorrect(null);
    setLearnMessage("Practice progress reset.");

    if (settings.spokenConfirmations && audioEnabled) {
      setLastSpokenMessage("Practice progress reset");
    }
  }

  function setSettingValue(key, value) {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  return (
    <div
      className={`app-shell ${darkMode ? "dark-mode" : ""} ${
        settings.highContrast ? "high-contrast" : ""
      }`}
    >
      <div className="dashboard">
        <header className="topbar">
          <div className="brand-left">
            <div className="brand-pill">
              <div className="brand-dot" />
              <span className="brand-text">BrailLearn</span>
            </div>
          </div>

          <div className="brand-right" />

          <div className="topbar-right" ref={settingsContainerRef}>
            <div
              className={`connection-dot ${connected ? "connected" : ""}`}
              title={connected ? "Connected" : "Disconnected"}
              aria-label={connected ? "Hardware connected" : "Hardware disconnected"}
            />

            <button
              className="settings-button"
              aria-label="Open settings"
              onClick={() => setShowSettings((prev) => !prev)}
            >
              <GearIcon />
            </button>

            {showSettings && (
              <div className="settings-dropdown" role="menu">
                <div className="settings-panel">
                  <div className="modal-header">
                    <h3>Settings</h3>
                    <button
                      className="modal-close"
                      onClick={() => setShowSettings(false)}
                      aria-label="Close settings"
                    >
                      ×
                    </button>
                  </div>

                  <div className="modal-body">
                    <div className="setting-row">
                      <label htmlFor="text-size-slider">Text Size</label>
                      <input
                        id="text-size-slider"
                        className="full-width"
                        type="range"
                        min="24"
                        max="96"
                        value={settings.textSize}
                        onChange={(e) =>
                          setSettingValue("textSize", Number(e.target.value))
                        }
                      />
                    </div>

                    <div className="setting-row checkbox-row">
                      <label htmlFor="audio-enabled">Audio</label>
                      <label className="toggle-switch">
                        <input
                          id="audio-enabled"
                          type="checkbox"
                          checked={settings.audioEnabled}
                          onChange={(e) =>
                            setSettingValue("audioEnabled", e.target.checked)
                          }
                        />
                        <span className="slider" />
                      </label>
                    </div>

                    <div className="setting-row">
                      <label>Audio Speed</label>
                      <div className="speed-options">
                        {["slow", "normal", "fast"].map((speed) => (
                          <button
                            key={speed}
                            type="button"
                            className={`speed-button ${
                              settings.audioSpeed === speed ? "active" : ""
                            }`}
                            onClick={() => setSettingValue("audioSpeed", speed)}
                          >
                            {speed.charAt(0).toUpperCase() + speed.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="setting-row checkbox-row">
                      <label htmlFor="spoken-confirmations">
                        Spoken Confirmations
                      </label>
                      <label className="toggle-switch">
                        <input
                          id="spoken-confirmations"
                          type="checkbox"
                          checked={settings.spokenConfirmations}
                          onChange={(e) =>
                            setSettingValue("spokenConfirmations", e.target.checked)
                          }
                        />
                        <span className="slider" />
                      </label>
                    </div>

                    <div className="setting-row checkbox-row">
                      <label htmlFor="dark-mode">Dark Mode</label>
                      <label className="toggle-switch">
                        <input
                          id="dark-mode"
                          type="checkbox"
                          checked={settings.darkMode}
                          onChange={(e) =>
                            setSettingValue("darkMode", e.target.checked)
                          }
                        />
                        <span className="slider" />
                      </label>
                    </div>

                    <div className="setting-row checkbox-row">
                      <label htmlFor="high-contrast">High Contrast</label>
                      <label className="toggle-switch">
                        <input
                          id="high-contrast"
                          type="checkbox"
                          checked={settings.highContrast}
                          onChange={(e) =>
                            setSettingValue("highContrast", e.target.checked)
                          }
                        />
                        <span className="slider" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="body">
          <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
            <button
              className="collapse-button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className={`collapse-arrow ${sidebarCollapsed ? "collapsed" : ""}`}>
                ‹
              </span>
            </button>

            <nav className="nav">
              {navItems.map((item) => (
                <SidebarItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  active={activeTab === item.label}
                  collapsed={sidebarCollapsed}
                  onClick={() => setActiveTab(item.label)}
                />
              ))}
            </nav>
          </aside>

          <main className="content">
            <div className="sr-live-region" aria-live="polite">
              {learnMessage}
            </div>

            {activeTab === "Home" && (
              <>
                <section className="section-card hero-card">
                  <p className="eyebrow">Audio-first braille note taker</p>
                  <h1>Home</h1>
                  <p className="support-text">
                    This screen supports note taking, setup, low-vision use, and demos.
                    The actual device should still be usable without relying on the screen.
                  </p>
                </section>

                <section className="section-card">
                  <h2 className="section-title">Current Note</h2>

                  <div className="text-display" style={{ fontSize: `${textSize}px` }}>
                    <span className="typed-text">{text}</span>
                    <span className="cursor" />
                  </div>

                  <div className="action-row">
                    <button
                      className="action-button"
                      onClick={() => speakText(text || "There is no note text yet.", audioSpeed)}
                    >
                      <VolumeIcon />
                      <span>Play Audio</span>
                    </button>

                    <button className="action-button" onClick={handleSaveNote}>
                      Save Note
                    </button>

                    <button className="action-button" onClick={exportNoteAsTxt}>
                      Export .txt
                    </button>

                    <button className="action-button" onClick={handleBackspace}>
                      Backspace
                    </button>

                    <button className="action-button" onClick={handleClear}>
                      Clear
                    </button>
                  </div>

                  <div className="status-chip-row">
                    <div className="status-chip">
                      <strong>Last Detected Letter:</strong> {detectedLetter || "—"}
                    </div>
                    <div className="status-chip">
                      <strong>Hardware:</strong> {connected ? "Connected" : "Disconnected"}
                    </div>
                  </div>
                </section>

                <section className="section-card">
                  <h2 className="section-title">Braille + Glove Preview</h2>
                  <p className="support-text">
                    Support view for low-vision users, instructors, setup, and demos.
                  </p>
                  <BrailleHandsPreview brailleDots={brailleDots} fingers={fingers} />
                </section>
              </>
            )}

            {activeTab === "Learn" && (
              <>
                <section className="section-card hero-card compact-hero">
                  <p className="eyebrow">Practice and exploration</p>
                  <h1>Learn</h1>
                </section>

                <section className="section-card">
                  <div className="learn-topbar">
                    <div className="learn-mode-toggle">
                      <button
                        className={learnMode === "practice" ? "mode-button active" : "mode-button"}
                        onClick={() => {
                          setLearnMode("practice");
                          setLearnCorrect(null);
                          setLearnMessage("Practice mode selected.");
                        }}
                      >
                        Practice
                      </button>

                      <button
                        className={learnMode === "explore" ? "mode-button active" : "mode-button"}
                        onClick={() => {
                          setLearnMode("explore");
                          setLearnCorrect(null);
                          setLearnMessage("Explore mode selected.");
                        }}
                      >
                        Explore
                      </button>
                    </div>

                    {learnMode === "practice" && (
                      <div className="learn-select-group">
                        <label htmlFor="target-letter">Target Letter</label>
                        <select
                          id="target-letter"
                          value={targetLetter}
                          onChange={(e) => {
                            setTargetLetter(e.target.value);
                            setLearnCorrect(null);
                            setDetectedLetter("");
                            setLearnMessage(`Target letter changed to ${e.target.value}`);
                            resetVisuals();
                          }}
                        >
                          {LETTERS.map((letter) => (
                            <option key={letter} value={letter}>
                              {letter}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </section>

                <section className="learn-grid learn-layout">
                  <div className="section-card">
                    <h2 className="section-title">
                      {learnMode === "practice" ? "Target" : "Detected Letter"}
                    </h2>

                    {learnMode === "practice" ? (
                      <>
                        <div className="target-letter-box">
                          <div className="big-letter">{targetLetter}</div>
                          <button
                            className="action-button compact-button"
                            onClick={() => speakText(`Target letter ${targetLetter}`, audioSpeed)}
                          >
                            Speak Target
                          </button>
                        </div>

                        <div className="tip-box">
                          <h3 className="mini-title">Tip</h3>
                          <p>
                            Dots used:{" "}
                            {LETTER_PATTERNS[targetLetter]
                              .map((dotIsOn, index) => (dotIsOn ? index + 1 : null))
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                          <p>Press the gloves and the app will check whether the letter matches.</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="target-letter-box">
                          <div className="big-letter">{detectedLetter || "—"}</div>
                          <button
                            className="action-button compact-button"
                            onClick={() =>
                              speakText(
                                detectedLetter
                                  ? `Detected ${detectedLetter}`
                                  : "No letter detected yet",
                                audioSpeed
                              )
                            }
                          >
                            Speak Letter
                          </button>
                        </div>

                        <div className="tip-box">
                          <h3 className="mini-title">Explore Mode</h3>
                          <p>
                            Use this mode to freely press glove combinations and hear/see what
                            letter was detected.
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="section-card">
                    <h2 className="section-title">Feedback</h2>

                    <div
                      className={`learn-feedback ${
                        learnCorrect === true
                          ? "correct"
                          : learnCorrect === false
                          ? "incorrect"
                          : ""
                      }`}
                    >
                      {learnMessage}
                    </div>

                    {learnMode === "practice" && (
                      <>
                        <div className="progress-wrap">
                          <div className="learn-progress">
                            <div className="learn-progress-bar">
                              <div
                                className="learn-progress-fill"
                                style={{
                                  width: `${(completedLetters.length / 26) * 100}%`,
                                }}
                              />
                            </div>
                            <span>{completedLetters.length} / 26 letters completed</span>
                          </div>
                        </div>

                        <div className="learn-bottom-actions">
                          <button onClick={nextTargetLetter}>Next Letter</button>
                          <button onClick={randomTargetLetter}>Random Letter</button>
                          <button onClick={resetLearnProgress}>Reset Progress</button>
                        </div>
                      </>
                    )}

                    <div className="status-chip-row learn-status-row">
                      <div className="status-chip">
                        <strong>Hardware:</strong> {connected ? "Connected" : "Disconnected"}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="section-card compact-card">
                  <h2 className="section-title">Braille + Glove Preview</h2>
                  <BrailleHandsPreview brailleDots={brailleDots} fingers={fingers} />
                </section>
              </>
            )}

            {activeTab === "Notes" && (
              <section className="section-card">
                <h1>Saved Notes</h1>
                <p className="support-text">
                  Notes are stored in localStorage for now, so they stay saved in this browser.
                </p>

                {notes.length === 0 ? (
                  <p>No notes saved yet.</p>
                ) : (
                  <ul className="notes-list">
                    {notes.map((note) => (
                      <li key={note.id} className="note-item">
                        {editingId === note.id ? (
                          <div className="note-edit-area">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={5}
                            />
                            <div className="note-actions">
                              <button onClick={saveEditedNote}>Save Edit</button>
                              <button onClick={cancelEditing}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="note-content">
                              <p>{note.text}</p>
                              <small>{note.createdAt}</small>
                            </div>

                            <div className="note-actions">
                              <button onClick={() => startEditingNote(note)}>Edit</button>
                              <button onClick={() => deleteNote(note.id)}>Delete</button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {activeTab === "History" && (
              <section className="section-card">
                <h1>History</h1>
                <p className="support-text">
                  Later, this can show recent note entries, practice attempts, and session history.
                </p>
              </section>
            )}

            {activeTab === "Sensor Data" && (
              <section className="section-card">
                <h1>Sensor Data</h1>
                <p className="support-text">
                  Later, this can show raw glove input, sensor debugging, and hardware status info.
                </p>
              </section>
            )}

            {activeTab === "About" && (
              <section className="section-card">
                <h1>About</h1>
                <p className="support-text">
                  BrailLearn is shifting toward an affordable, audio-first braille note taker with
                  optional visual support for low-vision users, instructors, setup, debugging, and
                  demos.
                </p>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function BrailleHandsPreview({ brailleDots, fingers }) {
  return (
    <div className="bottom-row full-preview-row">
      <section className="braille-panel">
        <div className="braille-panel-header">Braille Cell</div>
        <div className="braille-grid">
          {brailleDots.map((active, index) => (
            <div key={index} className="braille-cell">
              <div className={`braille-dot ${active ? "active" : ""}`} />
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
          <div className="hand-column">
            <div className="finger-name-row">
              <span>Thumb</span>
              <span>Middle</span>
              <span>Ring</span>
            </div>

            <div className="finger-icon-row">
              <FingerSymbol active={fingers.left.thumb} />
              <FingerSymbol active={fingers.left.middle} />
              <FingerSymbol active={fingers.left.ring} />
            </div>
          </div>

          <div className="hand-divider" />

          <div className="hand-column">
            <div className="finger-name-row">
              <span>Thumb</span>
              <span>Middle</span>
              <span>Ring</span>
            </div>

            <div className="finger-icon-row">
              <FingerSymbol active={fingers.right.thumb} />
              <FingerSymbol active={fingers.right.middle} />
              <FingerSymbol active={fingers.right.ring} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SidebarItem({ icon, label, active = false, collapsed = false, onClick }) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""} ${collapsed ? "collapsed" : ""}`}
      onClick={onClick}
    >
      <span className="nav-icon">{icon}</span>
      {!collapsed && <span className="nav-label">{label}</span>}
    </button>
  );
}

function FingerSymbol({ active }) {
  return (
    <div className={`finger-symbol ${active ? "active" : ""}`}>
      <svg viewBox="0 0 64 64" className="finger-svg" aria-hidden="true">
        <path d="M24 50V23c0-2 1.6-3.5 3.5-3.5S31 21 31 23v11h1V18c0-2 1.6-3.5 3.5-3.5S39 16 39 18v16h1V21c0-2 1.6-3.5 3.5-3.5S47 19 47 21v18c0 7-5.8 13-13 13h-2c-4.7 0-8-1.9-10.5-5.7l-4.4-6.8c-1-1.5-.6-3.6.9-4.6 1.4-.9 3.3-.6 4.4.7L24 39V23" />
      </svg>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true">
      <path d="M4 11.5 12 5l8 6.5v7.5a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function LearnIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true">
      <path d="M12 5 3 9.5 12 14l7-3.5V17h2V9.5zM6 12.2V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.8L12 15z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true">
      <path d="M12 5a7 7 0 1 1-6.3 4H3l3.2-3.2L9.5 9H7.8A5 5 0 1 0 12 7v5l4 2-.8 1.8L10 13V5z" />
    </svg>
  );
}

function SensorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true">
      <path d="M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 10c4.4 0 8 1.8 8 4v2H4v-2c0-2.2 3.6-4 8-4z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true">
      <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 7h2V7h-2zm0 8h2v-6h-2z" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sidebar-svg" aria-hidden="true">
      <path d="M6 3h9l3 3v15H6zM14 3v4h4M8 10h8M8 14h8M8 18h5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="gear-svg" aria-hidden="true">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="volume-svg" aria-hidden="true">
      <path d="M5 10h4l5-4v12l-5-4H5zm11.5 2a4.5 4.5 0 0 0-2.2-3.9v7.8a4.5 4.5 0 0 0 2.2-3.9zm1.8 0c0 3-1.7 5.6-4.2 6.9v-2.2a5 5 0 0 0 0-9.4V5.1c2.5 1.3 4.2 3.9 4.2 6.9z" />
    </svg>
  );
}

export default App;
import React, { useMemo, useState, useEffect, useRef } from "react";
import "./App.css";

function App() {
  const [text, setText] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState("Home");
  const [brailleDots, setBrailleDots] = useState([false, false, false, false, false, false]);

  const [fingers, setFingers] = useState({
    left: { thumb: false, middle: false, ring: false },
    right: { thumb: false, middle: false, ring: false },
  });
  const [connected, setConnected] = useState(false);
  const [textSize, setTextSize] = useState(56);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioSpeed, setAudioSpeed] = useState("normal");
  const [darkMode, setDarkMode] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const settingsContainerRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:5001");

    ws.addEventListener("message", (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === "status") {
          setConnected(!!data.connected);
        }
      } catch (e) {
        // ignore malformed messages
      }
    });

    ws.addEventListener("close", () => setConnected(false));

    return () => {
      try {
        ws.close();
      } catch (e) {}
    };
  }, []);

  // close settings dropdown when clicking outside the topbar-right area
  useEffect(() => {
    function onDocClick(e) {
      if (!settingsContainerRef.current) return;
      if (!settingsContainerRef.current.contains(e.target)) {
        setShowSettings(false);
      }
    }

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const navItems = useMemo(
    () => [
      { label: "Home", icon: <HomeIcon /> },
      { label: "Learn", icon: <LearnIcon /> },
      { label: "History", icon: <HistoryIcon /> },
      { label: "Sensor Data", icon: <SensorIcon /> },
      { label: "About", icon: <InfoIcon /> },
    ],
    []
  );

  const resetVisuals = () => {
    setBrailleDots([false, false, false, false, false, false]);
    setFingers({
      left: { thumb: false, middle: false, ring: false },
      right: { thumb: false, middle: false, ring: false },
    });
  };

  // temporary testing buttons
  const testA = () => {
    setText((prev) => prev + "A");
    setBrailleDots([true, false, false, false, false, false]);
    setFingers({
      left: { thumb: false, middle: false, ring: true },
      right: { thumb: false, middle: false, ring: false },
    });
  };

  const testB = () => {
    setText((prev) => prev + "B");
    setBrailleDots([true, false, true, false, false, false]);
    setFingers({
      left: { thumb: false, middle: true, ring: true },
      right: { thumb: false, middle: false, ring: false },
    });
  };


  return (
    <div className={`app-shell ${darkMode ? "dark-mode" : ""}`}>
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
              className={`connection-dot ${connected ? "connected" : "disconnected"}`}
              title={connected ? "Connected" : "Disconnected"}
            />
            <button
              className="settings-button"
              aria-label="Settings"
              onClick={() => setShowSettings((s) => !s)}
            >
              <GearIcon />
            </button>
            {showSettings && (
              <div className="settings-dropdown" role="menu" onClick={(e) => e.stopPropagation()}>
                <div className="settings-panel">
                  <div className="modal-header">
                    <h3>Settings</h3>
                    <button className="modal-close" onClick={() => setShowSettings(false)} aria-label="Close settings">×</button>
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
                        value={textSize}
                        onChange={(e) => setTextSize(Number(e.target.value))}
                      />
                    </div>
                    <div className="setting-row checkbox-row">
                      <label htmlFor="audio-enabled">Audio</label>
                      <label className="toggle-switch">
                        <input
                          id="audio-enabled"
                          type="checkbox"
                          checked={audioEnabled}
                          onChange={(e) => setAudioEnabled(e.target.checked)}
                        />
                        <span className="slider" />
                      </label>
                    </div>
                    <div className="setting-row">
                      <label>Audio Speed</label>
                      <div className="speed-options">
                        {['slow', 'normal', 'fast'].map((speed) => (
                          <button
                            key={speed}
                            type="button"
                            className={`speed-button ${audioSpeed === speed ? 'active' : ''}`}
                            onClick={() => setAudioSpeed(speed)}
                          >
                            {speed.charAt(0).toUpperCase() + speed.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="setting-row checkbox-row">
                      <label htmlFor="dark-mode">Dark Mode</label>
                      <label className="toggle-switch">
                        <input
                          id="dark-mode"
                          type="checkbox"
                          checked={darkMode}
                          onChange={(e) => setDarkMode(e.target.checked)}
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
            {activeTab === "Home" && (
              <>
                <div className="text-display" style={{ fontSize: `${textSize}px` }}>
                  <span className="typed-text">{text}</span>
                  <span className="cursor" />
                </div>

                <div className="action-row">
                  <button className="action-button">
                    <VolumeIcon />
                    <span>Play Audio</span>
                  </button>

                  <button
                    className="action-button"
                    onClick={() => setText((prev) => prev.slice(0, -1))}
                  >
                    Backspace
                  </button>

                  <button
                    className="action-button"
                    onClick={() => {
                      setText("");
                      resetVisuals();
                    }}
                  >
                    Clear
                  </button>
                </div>

                <div className="test-row">
                  <button className="test-button" onClick={testA}>Test A</button>
                  <button className="test-button" onClick={testB}>Test B</button>
                  <button className="test-button" onClick={resetVisuals}>Reset Highlights</button>
                </div>

                <div className="bottom-row">
                  <section className="braille-panel">
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
                      <span className="hands-side-label">L</span>
                      <span className="hands-side-label">R</span>
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
              </>
            )}

            {activeTab === "Learn" && (
              <div className="tab-view">
                <h2>Learn</h2>
                <p>Welcome to the Learn tab. Put your lessons and learning experience here.</p>
              </div>
            )}

            {activeTab === "History" && (
              <div className="tab-view">
                <h2>History</h2>
                <p>History data and logs will appear here.</p>
              </div>
            )}

            {activeTab === "Sensor Data" && (
              <div className="tab-view">
                <h2>Sensor Data</h2>
                <p>Sensor telemetry and graph previews go here.</p>
              </div>
            )}

            {activeTab === "About" && (
              <div className="tab-view">
                <h2>About</h2>
                <p>Information about the app.</p>
              </div>
            )}
          </main>
        </div>
      </div>
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
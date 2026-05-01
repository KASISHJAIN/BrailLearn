import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Braille / sensor pattern map (matches getLetter() in firmware) ───────────
// Index: [s0, s1, s2, s3, s4, s5]
// Pins:  [36, 39, 34, 35, 32, 33]  → left thumb, left middle, left ring, right thumb, right middle, right ring
const LETTER_MAP = {
  A: [1,0,0,0,0,0], B: [1,1,0,0,0,0], C: [1,0,0,1,0,0], D: [1,0,0,1,1,0],
  E: [1,0,0,0,1,0], F: [1,1,0,1,0,0], G: [1,1,0,1,1,0], H: [1,1,0,0,1,0],
  I: [0,1,0,1,0,0], J: [0,1,0,1,1,0], K: [1,0,1,0,0,0], L: [1,1,1,0,0,0],
  M: [1,0,1,1,0,0], N: [1,0,1,1,1,0], O: [1,0,1,0,1,0], P: [1,1,1,1,0,0],
  Q: [1,1,1,1,1,0], R: [1,1,1,0,1,0], S: [0,1,1,1,0,0], T: [0,1,1,1,1,0],
  U: [1,0,1,0,0,1], V: [1,1,1,0,0,1], W: [0,1,0,1,1,1], X: [1,0,1,1,0,1],
  Y: [1,0,1,1,1,1], Z: [1,0,1,0,1,1],
};

const TARGET = "BRAILLEARN";

// ─── Sub-components ────────────────────────────────────────────────────────────

function BrailleHint({ letter }) {
  const pattern = LETTER_MAP[letter] || [0,0,0,0,0,0];

  return (
    <div className="game-hint-card">
      <p className="game-hint-label">Spell this letter</p>
      <div className="game-hint-letter">{letter}</div>

      {/* Braille dot grid */}
      <div className="game-braille-grid">
        {[0, 1].map((col) => (
          <div key={col} className="game-braille-col">
            {[0, 1, 2].map((row) => {
              const idx = col * 3 + row;
              return (
                <div
                  key={row}
                  className={`game-braille-dot ${pattern[idx] ? "active" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Finger map */}
      <div className="game-finger-map">
        {[
          { label: "Left", fingers: ["Thumb", "Mid", "Ring"], offset: 0 },
          { label: "Right", fingers: ["Thumb", "Mid", "Ring"], offset: 3 },
        ].map(({ label, fingers, offset }) => (
          <div key={label} className="game-hand">
            <span className="game-hand-label">{label}</span>
            <div className="game-fingers">
              {fingers.map((name, i) => (
                <div key={name} className="game-finger">
                  <div
                    className={`game-finger-circle ${
                      pattern[offset + i] ? "active" : ""
                    }`}
                  />
                  <span className="game-finger-name">{name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TargetWord({ target, current, errorIndex }) {
  return (
    <div className="game-target-word">
      {target.split("").map((ch, i) => {
        let cls = "game-target-char";
        if (i < current) cls += " done";
        else if (i === current) cls += " active";
        if (i === errorIndex) cls += " error";
        return (
          <div key={i} className={cls}>
            {ch}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function TypingGame() {
  const [current, setCurrent] = useState(0);
  const [errorIndex, setErrorIndex] = useState(null);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("neutral"); // "neutral" | "success" | "error"
  const [complete, setComplete] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef(null);

  // WebSocket: listen for hardware gestures from ESP32 via the existing server
  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket("ws://localhost:5001");
      ws.addEventListener("message", (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "gesture" && data.letter) {
            handleGuess(data.letter.toUpperCase());
          }
        } catch (_) {}
      });
    } catch (_) {}
    return () => {
      try { ws && ws.close(); } catch (_) {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, complete]);

  const handleGuess = useCallback(
    (letter) => {
      if (complete || current >= TARGET.length) return;
      const expected = TARGET[current];
      if (letter === expected) {
        setErrorIndex(null);
        setStatus(`Correct! ${current + 2 <= TARGET.length ? `Next: ${TARGET[current + 1] || ""}` : ""}`);
        setStatusType("success");
        const next = current + 1;
        setCurrent(next);
        if (next >= TARGET.length) {
          setComplete(true);
          setStatus("");
        }
      } else {
        setErrorIndex(current);
        setStatus(`Try again — expected "${expected}"`);
        setStatusType("error");
        setTimeout(() => setErrorIndex(null), 500);
      }
      setInputVal("");
      inputRef.current && inputRef.current.focus();
    },
    [current, complete]
  );

  const submit = () => {
    const v = inputVal.trim().toUpperCase();
    if (v) handleGuess(v);
  };

  const restart = () => {
    setCurrent(0);
    setErrorIndex(null);
    setStatus("");
    setStatusType("neutral");
    setComplete(false);
    setInputVal("");
    setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
  };

  return (
    <>
      <style>{GAME_CSS}</style>

      <div className="game-shell">
        {/* Progress bar */}
        <div className="game-progress-bar">
          <div
            className="game-progress-fill"
            style={{ width: `${(current / TARGET.length) * 100}%` }}
          />
        </div>

        <div className="game-progress-label">
          {current} / {TARGET.length} letters
        </div>

        {/* Target word */}
        <TargetWord target={TARGET} current={current} errorIndex={errorIndex} />

        {!complete ? (
          <>
            {/* Hint card */}
            <BrailleHint letter={TARGET[current]} />

            {/* Keyboard input fallback */}
            <div className="game-input-row">
              <input
                ref={inputRef}
                className="game-input"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value.toUpperCase().slice(-1))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                maxLength={1}
                placeholder="?"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button className="game-submit-btn" onClick={submit}>
                Enter
              </button>
            </div>

            {status && (
              <p className={`game-status game-status--${statusType}`}>{status}</p>
            )}
          </>
        ) : (
          <div className="game-complete">
            <div className="game-complete-icon">✓</div>
            <h3 className="game-complete-title">You spelled it!</h3>
            <p className="game-complete-sub">BRAILLEARN — all 10 letters done.</p>
            <button className="game-restart-btn" onClick={restart}>
              Play again
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Scoped CSS ────────────────────────────────────────────────────────────────
const GAME_CSS = `
.game-shell {
  padding: 1.5rem 1rem 2rem;
  max-width: 560px;
  margin: 0 auto;
}

/* Progress */
.game-progress-bar {
  height: 4px;
  background: var(--color-border-tertiary, #e5e5e5);
  border-radius: 99px;
  overflow: hidden;
  margin-bottom: 6px;
}
.game-progress-fill {
  height: 100%;
  background: #378ADD;
  border-radius: 99px;
  transition: width 0.3s ease;
}
.game-progress-label {
  font-size: 12px;
  color: var(--color-text-secondary, #888);
  margin-bottom: 1.25rem;
}

/* Target word */
.game-target-word {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}
.game-target-char {
  width: 44px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 500;
  border-radius: 8px;
  border: 0.5px solid var(--color-border-tertiary, #ddd);
  background: var(--color-background-secondary, #f5f5f5);
  color: var(--color-text-primary, #111);
  transition: background 0.15s, border-color 0.15s;
}
.game-target-char.done {
  background: #EAF3DE;
  border-color: #639922;
  color: #3B6D11;
}
.game-target-char.active {
  border: 1.5px solid #378ADD;
  background: #E6F1FB;
  color: #185FA5;
}
.game-target-char.error {
  background: #FCEBEB;
  border-color: #E24B4A;
  color: #A32D2D;
  animation: game-shake 0.25s ease;
}
@keyframes game-shake {
  0%, 100% { transform: translateX(0); }
  25%       { transform: translateX(-4px); }
  75%       { transform: translateX(4px); }
}

/* Hint card */
.game-hint-card {
  background: var(--color-background-secondary, #f8f8f8);
  border: 0.5px solid var(--color-border-tertiary, #ddd);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
}
.game-hint-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary, #888);
  margin-bottom: 6px;
}
.game-hint-letter {
  font-size: 40px;
  font-weight: 500;
  color: var(--color-text-primary, #111);
  text-align: center;
  margin-bottom: 1rem;
}

/* Braille dots */
.game-braille-grid {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 1rem;
}
.game-braille-col {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.game-braille-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--color-border-secondary, #ccc);
  background: var(--color-background-primary, #fff);
  transition: background 0.15s, border-color 0.15s;
}
.game-braille-dot.active {
  background: #378ADD;
  border-color: #185FA5;
}

/* Finger map */
.game-finger-map {
  display: flex;
  gap: 24px;
  justify-content: center;
}
.game-hand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.game-hand-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary, #888);
}
.game-fingers {
  display: flex;
  gap: 10px;
}
.game-finger {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.game-finger-circle {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 0.5px solid var(--color-border-tertiary, #ddd);
  background: var(--color-background-primary, #fff);
  transition: background 0.1s, border-color 0.1s;
}
.game-finger-circle.active {
  background: #378ADD;
  border-color: #185FA5;
}
.game-finger-name {
  font-size: 10px;
  color: var(--color-text-tertiary, #aaa);
}

/* Input row */
.game-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 0.75rem;
}
.game-input {
  width: 60px;
  height: 60px;
  font-size: 28px;
  font-weight: 500;
  text-align: center;
  text-transform: uppercase;
  border: 0.5px solid var(--color-border-secondary, #ccc);
  border-radius: 8px;
  background: var(--color-background-primary, #fff);
  color: var(--color-text-primary, #111);
  outline: none;
}
.game-input:focus {
  border: 1.5px solid #378ADD;
  box-shadow: 0 0 0 3px rgba(55,138,221,0.12);
}
.game-submit-btn {
  padding: 10px 22px;
  font-size: 14px;
  border-radius: 8px;
  border: 0.5px solid var(--color-border-secondary, #ccc);
  background: var(--color-background-primary, #fff);
  color: var(--color-text-primary, #111);
  cursor: pointer;
}
.game-submit-btn:hover { background: var(--color-background-secondary, #f5f5f5); }
.game-submit-btn:active { transform: scale(0.98); }

/* Status */
.game-status {
  font-size: 13px;
  min-height: 20px;
}
.game-status--success { color: #3B6D11; }
.game-status--error   { color: #A32D2D; }
.game-status--neutral { color: var(--color-text-secondary, #888); }

/* Complete */
.game-complete {
  text-align: center;
  padding: 2rem 1rem;
  background: #EAF3DE;
  border-radius: 12px;
  border: 0.5px solid #639922;
  color: #3B6D11;
}
.game-complete-icon {
  font-size: 36px;
  margin-bottom: 8px;
}
.game-complete-title {
  font-size: 20px;
  font-weight: 500;
  margin-bottom: 6px;
}
.game-complete-sub {
  font-size: 14px;
  opacity: 0.8;
  margin-bottom: 1.25rem;
}
.game-restart-btn {
  padding: 10px 26px;
  border-radius: 8px;
  border: 0.5px solid #639922;
  background: #EAF3DE;
  color: #3B6D11;
  cursor: pointer;
  font-size: 14px;
}
.game-restart-btn:hover { background: #C0DD97; }
`;

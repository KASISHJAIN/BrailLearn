// ============================================================
// main.cpp — ESP32 Braille Glove Firmware
// Reads 6 FSR sensors → detects Braille letter → sends via WebSocket
// ============================================================

#include <Arduino.h>          // Core Arduino functions (analogRead, delay, Serial, etc.)
#include <WiFi.h>             // ESP32 WiFi driver
#include <WebSocketsClient.h> // WebSocket client library (links to Node.js server)
#include "secrets.h"          // WiFi credentials + server IP/port (kept out of source control)

// ============================================================
// GLOBALS — shared state across functions
// ============================================================

bool gestureSent = false;           // True after a letter has been sent this press cycle
String lastLetter = "";             // The last letter that was sent
unsigned long lastSendTime = 0;     // Timestamp of last send (ms since boot)
const int debounceDelay = 400;      // Minimum ms between sends of the same letter
String lastSentLetter = "";         // Mirror of lastLetter (used for debounce comparison)

// Hard lock: once a gesture is sent, this blocks ANY further send until fingers lift.
// Prevents a held gesture from spamming the server multiple times per press.
bool gestureLocked = false;

// ============================================================
// WIFI + SERVER CONFIG — pulled from secrets.h
// ============================================================

const char* ssid = WIFI_SSID;          // WiFi network name
const char* password = WIFI_PASSWORD;  // WiFi password
const char* server_ip = SERVER_IP;     // LAN IP of the Node.js WebSocket server
const int server_port = SERVER_PORT;   // Port (5001)

WebSocketsClient webSocket; // WebSocket client instance — manages connection to server
bool wsConnected = false;   // Tracks whether WebSocket handshake has completed

// ============================================================
// PIN MAPPING — all ADC1 pins (safe to use with WiFi active)
// GPIO 36, 39 = input-only, no internal pull-up/down → MUST have external 10kΩ to GND
// GPIO 32, 33, 34, 35 = standard input-capable ADC1 pins
// ============================================================
const int ANALOG_PINS[6] = {36, 39, 34, 35, 32, 33};
//                           s0  s1  s2  s3  s4  s5
// Maps to Braille dots:      1   2   3   4   5   6

// ============================================================
// CALIBRATION STORAGE — filled by calibrateSensors() at boot
// ============================================================
int baseline[6];  // Resting ADC value per sensor (no pressure applied)
int threshold[6]; // baseline + offset → reading above this = finger pressed

// ============================================================
// SETTINGS
// ============================================================
const int DEBOUNCE_MS = 500;        // (reserved — debounceDelay above is the active one)
unsigned long lastLetterTime = 0;   // (reserved for future per-letter timing)

// ============================================================
// DEBUG CONTROL — set false to silence Serial output in production
// ============================================================
bool DEBUG = true;

// ============================================================
// WEBSOCKET EVENT HANDLER
// Called automatically by WebSocketsClient on connection events.
// ============================================================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length)
{
  if (type == WStype_CONNECTED) {
    wsConnected = true;
    Serial.println("WebSocket Connected");
  }
  else if (type == WStype_DISCONNECTED) {
    // WebSocketsClient auto-reconnects every 2000ms (set in setup)
    wsConnected = false;
    Serial.println("WebSocket Disconnected");
  }
}

// ============================================================
// CALIBRATION — samples each sensor 120 times at rest.
// Sets baseline (average resting value) and threshold (baseline + 300).
//
// FIX: Re-enabled in setup() — was previously commented out which left
// threshold[] at 0, meaning every sensor always read as "pressed"
// and the gesture lock never worked correctly.
// Threshold raised from baseline+180 → baseline+300 because 180 was
// sitting too close to the ESP32's natural ADC noise floor.
// ============================================================
void calibrateSensors()
{
  Serial.println("Calibrating... keep hands OFF sensors");

  long sum[6] = {0};

  // Take 120 samples over ~600ms, all sensors simultaneously
  for (int i = 0; i < 120; i++) {
    for (int j = 0; j < 6; j++) {
      sum[j] += analogRead(ANALOG_PINS[j]);
    }
    delay(5);
  }

  for (int j = 0; j < 6; j++) {
    baseline[j] = sum[j] / 120;       // Average resting value for this sensor
    threshold[j] = baseline[j] + 300; // FIX: raised from 180 → 300 to clear noise floor
    Serial.print("Sensor ");
    Serial.print(j);
    Serial.print(" | baseline: ");
    Serial.print(baseline[j]);
    Serial.print(" | threshold: ");
    Serial.println(threshold[j]);
  }

  Serial.println("Calibration done.");
}

// ============================================================
// READ FINGER — averages 5 ADC reads for one sensor with settle delays.
//
// FIX: Added dummy read + delayMicroseconds(500) between samples.
// WHY: The ESP32 ADC has an internal sample-and-hold capacitor.
// When switching between pins (or re-reading the same pin after others),
// residual charge from the previous pin bleeds into the next sample.
// The dummy read + 200µs clears that residual charge.
// The 500µs between real samples gives the capacitor time to fully
// settle to the actual voltage on this pin each time.
// Without these delays, sensors bleed into each other = cross-talk.
// ============================================================
int readFinger(int pin)
{
  analogRead(pin);         // Dummy read — clears residual charge from previous pin
  delayMicroseconds(200);  // Let capacitor settle after dummy read

  long sum = 0;
  for (int i = 0; i < 5; i++) {
    sum += analogRead(pin);
    delayMicroseconds(500); // FIX: settle between each real sample
  }
  return sum / 5;
}

// ============================================================
// READ STATE — fills bool[6] with pressed/not-pressed per sensor.
// Uses each sensor's personal threshold set by calibrateSensors().
// ============================================================
void readState(bool state[6])
{
  for (int i = 0; i < 6; i++) {
    // true if averaged reading exceeds this sensor's individual threshold
    state[i] = readFinger(ANALOG_PINS[i]) > threshold[i];
  }
}

// ============================================================
// DEBUG PRINT — prints the 6-bit pattern only when DEBUG=true.
// Called with a tag like "FINAL" to label what event triggered it.
// ============================================================
void printPatternOnce(bool s[6], const char* tag)
{
  if (!DEBUG) return;

  Serial.print(tag);
  Serial.print(" Pattern: ");

  for (int i = 0; i < 6; i++) {
    Serial.print(s[i]);
    Serial.print(" ");
  }
  Serial.println();
}

// ============================================================
// RESET GESTURE — clears send flags between press cycles.
// Called after a letter is fully sent and fingers have lifted.
// ============================================================
void resetGesture() {
  gestureSent = false;
  gestureLocked = false; // Unlock so the next press cycle can send
  lastLetter = "";
}

// ============================================================
// SEND LETTER ONCE — guards against repeated sends for one gesture.
//
// Guards run in order:
//   1. Empty letter          → skip
//   2. gestureLocked         → skip (hard block, one send per press cycle)
//   3. Same letter too fast  → skip (soft debounce)
//   4. Otherwise             → send via WebSocket + lock
// ============================================================
void sendLetterOnce(String letter) {
  unsigned long now = millis();

  if (letter == "") return; // Nothing to send

  // Hard block: already sent once this press cycle
  if (gestureLocked) return;

  // Soft debounce: same letter sent too recently
  if (gestureSent && (letter == lastLetter && (now - lastSendTime < debounceDelay))) {
    return;
  }

  // All guards passed — commit the send
  gestureSent = true;
  gestureLocked = true;  // Lock until resetGesture() is called on release
  lastSendTime = now;
  lastLetter = letter;
  lastSentLetter = letter;

  Serial.println("LETTER: " + letter);

  // Only transmit if WebSocket connection is live
  if (wsConnected) {
    // JSON payload: {"client":"esp32","type":"gesture","letter":"A"}
    String msg = "{\"client\":\"esp32\",\"type\":\"gesture\",\"letter\":\"";
    msg += letter;
    msg += "\"}";
    webSocket.sendTXT(msg);
  }
}

// ============================================================
// LETTER DECODER — maps 6-bit boolean pattern to a Braille letter.
// s[0]..s[5] = Braille dots 1..6
// Dot layout: 1,2,3 = left column top→bottom / 4,5,6 = right column top→bottom
// Returns '*' if no pattern matches (unrecognized or partial gesture).
// ============================================================
char getLetter(bool s[6])
{
  if( s[0]&&!s[1]&&!s[2]&&!s[3]&&!s[4]&&!s[5]) return 'A'; // dot 1
  if( s[0]&& s[1]&&!s[2]&&!s[3]&&!s[4]&&!s[5]) return 'B'; // dots 1,2
  if( s[0]&&!s[1]&&!s[2]&& s[3]&&!s[4]&&!s[5]) return 'C'; // dots 1,4
  if( s[0]&&!s[1]&&!s[2]&& s[3]&& s[4]&&!s[5]) return 'D'; // dots 1,4,5
  if( s[0]&&!s[1]&&!s[2]&&!s[3]&& s[4]&&!s[5]) return 'E'; // dots 1,5
  if( s[0]&& s[1]&&!s[2]&& s[3]&&!s[4]&&!s[5]) return 'F'; // dots 1,2,4
  if( s[0]&& s[1]&&!s[2]&& s[3]&& s[4]&&!s[5]) return 'G'; // dots 1,2,4,5
  if( s[0]&& s[1]&&!s[2]&&!s[3]&& s[4]&&!s[5]) return 'H'; // dots 1,2,5
  if(!s[0]&& s[1]&&!s[2]&& s[3]&&!s[4]&&!s[5]) return 'I'; // dots 2,4
  if(!s[0]&& s[1]&&!s[2]&& s[3]&& s[4]&&!s[5]) return 'J'; // dots 2,4,5
  if( s[0]&&!s[1]&& s[2]&&!s[3]&&!s[4]&&!s[5]) return 'K'; // dots 1,3
  if( s[0]&& s[1]&& s[2]&&!s[3]&&!s[4]&&!s[5]) return 'L'; // dots 1,2,3
  if( s[0]&&!s[1]&& s[2]&& s[3]&&!s[4]&&!s[5]) return 'M'; // dots 1,3,4
  if( s[0]&&!s[1]&& s[2]&& s[3]&& s[4]&&!s[5]) return 'N'; // dots 1,3,4,5
  if( s[0]&&!s[1]&& s[2]&&!s[3]&& s[4]&&!s[5]) return 'O'; // dots 1,3,5
  if( s[0]&& s[1]&& s[2]&& s[3]&&!s[4]&&!s[5]) return 'P'; // dots 1,2,3,4
  if( s[0]&& s[1]&& s[2]&& s[3]&& s[4]&&!s[5]) return 'Q'; // dots 1,2,3,4,5
  if( s[0]&& s[1]&& s[2]&&!s[3]&& s[4]&&!s[5]) return 'R'; // dots 1,2,3,5
  if(!s[0]&& s[1]&& s[2]&& s[3]&&!s[4]&&!s[5]) return 'S'; // dots 2,3,4
  if(!s[0]&& s[1]&& s[2]&& s[3]&& s[4]&&!s[5]) return 'T'; // dots 2,3,4,5
  if( s[0]&&!s[1]&& s[2]&&!s[3]&&!s[4]&& s[5]) return 'U'; // dots 1,3,6
  if( s[0]&& s[1]&& s[2]&&!s[3]&&!s[4]&& s[5]) return 'V'; // dots 1,2,3,6
  if(!s[0]&& s[1]&&!s[2]&& s[3]&& s[4]&& s[5]) return 'W'; // dots 2,4,5,6
  if( s[0]&&!s[1]&& s[2]&& s[3]&&!s[4]&& s[5]) return 'X'; // dots 1,3,4,6
  if( s[0]&&!s[1]&& s[2]&& s[3]&& s[4]&& s[5]) return 'Y'; // dots 1,3,4,5,6
  if( s[0]&&!s[1]&& s[2]&&!s[3]&& s[4]&& s[5]) return 'Z'; // dots 1,3,5,6
  return '*'; // No matching pattern
}

// ============================================================
// SETUP — runs once at boot
// ============================================================
void setup()
{
  Serial.begin(115200); // Fast baud for debug output

  // Connect to WiFi — blocks until connected
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    Serial.print(" Status: ");
    Serial.println(WiFi.status());
  }
  Serial.println("\nWiFi Connected");
  Serial.println(WiFi.localIP()); // Print assigned LAN IP for debugging

  // Start WebSocket connection to Node.js server
  webSocket.begin(server_ip, server_port, "/");
  webSocket.onEvent(webSocketEvent);    // Register event handler above
  webSocket.setReconnectInterval(2000); // Auto-retry every 2s if disconnected

  // FIX: Calibration re-enabled — do NOT comment this out again.
  // This sets per-sensor thresholds. Without it threshold[] = 0
  // and every sensor permanently reads as pressed.
  calibrateSensors();
}

// ============================================================
// LOOP — runs continuously at ~50Hz
// Flow: read sensors → detect press → capture letter → send on release
// ============================================================
void loop()
{
  // Must be called every loop — handles WebSocket keep-alive + incoming messages
  webSocket.loop();

  // Read current 6-sensor state into bool array
  bool state[6];
  readState(state);

  // Check if ANY sensor is currently above its threshold
  bool anyPressed = false;
  for (int i = 0; i < 6; i++) {
    if (state[i]) anyPressed = true;
  }

  // Static vars persist between loop iterations (edge detection)
  static bool wasPressed = false;
  static char heldLetter = '*'; // Best letter seen while fingers were held down

  if (anyPressed) {
    // While fingers are held, keep decoding — captures the settled pattern
    // even if fingers land one at a time
    char letter = getLetter(state);
    if (letter != '*') {
      heldLetter = letter; // Update to best known letter while held
    }
  }

  // RELEASE EVENT — fires on the first loop where fingers just lifted
  if (wasPressed && !anyPressed) {
    Serial.println("RELEASE DETECTED");
    printPatternOnce(state, "FINAL");

    // FIX: Send logic re-enabled — transmits the settled letter on release
    if (heldLetter != '*') {
      sendLetterOnce(String(heldLetter));
    }
    heldLetter = '*';      // Reset for next gesture
    gestureSent = false;   // Clear send flag
    gestureLocked = false; // Unlock for next press cycle
  }

  // Update edge-detection flag for next iteration
  wasPressed = anyPressed;

  // Raw ADC debug output — gated behind DEBUG to avoid flooding production Serial
  if (DEBUG) {
    for (int i = 0; i < 6; i++) {
      Serial.print(analogRead(ANALOG_PINS[i]));
      Serial.print(" ");
    }
    Serial.println();
  }

  delay(20); // ~50Hz sample rate
}

/*
  ============================================================
  SYSTEM FLOW DIAGRAM
  ============================================================

  [Boot]
     │
     ▼
  WiFi.begin() ──loops──► Connected
     │
     ▼
  webSocket.begin() ──────► Node.js server (ws://SERVER_IP:5001)
     │
     ▼
  calibrateSensors() ✅ NOW ENABLED
    └─ 120 samples per sensor at rest
    └─ baseline[i] = average resting ADC value
    └─ threshold[i] = baseline[i] + 300  ← raised from 180
    └─ prints all 6 baselines to Serial
     │
     ▼
  ┌──────────────────────────────────────────────────────┐
  │                   LOOP (~50Hz)                       │
  │                                                      │
  │  webSocket.loop()  ← keep-alive ping                 │
  │         │                                            │
  │         ▼                                            │
  │  readState(state[6])                                 │
  │    └─ readFinger(pin) × 6                            │
  │         ├─ analogRead(pin)       ← dummy read        │
  │         ├─ delayMicroseconds(200) ← capacitor settle │
  │         └─ avg of 5 analogRead() with 500µs gaps     │
  │              ← FIX: kills cross-talk between sensors │
  │         │                                            │
  │         ▼                                            │
  │  anyPressed? ──No──► wasPressed=false, loop again    │
  │         │                                            │
  │        Yes                                           │
  │         │                                            │
  │         ▼                                            │
  │  getLetter(state) → heldLetter (updated each tick)   │
  │         │                                            │
  │  wasPressed && !anyPressed?  ← RELEASE EVENT         │
  │         │                                            │
  │        Yes                                           │
  │         │                                            │
  │         ▼                                            │
  │  sendLetterOnce(heldLetter) -> NOW ENABLED           │
  │    ├─ gestureLocked? → skip                          │
  │    ├─ same letter < 400ms? → skip                    │
  │    └─ webSocket.sendTXT(JSON)                        │
  │         │                                            │
  │  heldLetter = '*'                                    │
  │  gestureLocked = false  ← unlock for next press      │
  │         │                                            │
  │  Serial raw print (DEBUG only)                       │
  │         │                                            │
  │       delay(20ms)                                    │
  └──────────────────────────────────────────────────────┘
         │
         ▼
  webSocket.sendTXT(JSON)
    {"client":"esp32","type":"gesture","letter":"A"}
         │
         ▼
  Node.js server → dedup check → broadcast → React frontend

  ============================================================
*/
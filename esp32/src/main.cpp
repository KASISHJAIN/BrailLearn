#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include "secrets.h"

// ===================================================
// 🌐 WIFI + SERVER CONFIG
// ===================================================

const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;

const char* server_ip = SERVER_IP;
const int server_port = SERVER_PORT;

WebSocketsClient webSocket;
bool wsConnected = false;

// ===================================================
// 📌 PIN MAPPING
// ===================================================
const int ANALOG_PINS[6] = {36, 39, 34, 35, 32, 33};

// ===================================================
// 📊 CALIBRATION
// ===================================================
int baseline[6];
int threshold[6];

// ===================================================
// 🔧 SETTINGS
// ===================================================
const int DEBOUNCE_MS = 500;
unsigned long lastLetterTime = 0;

// ===================================================
// 🧠 DEBUG CONTROL
// ===================================================
bool DEBUG = true;

// ===================================================
// 🔌 WEB SOCKET EVENT
// ===================================================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length)
{
  if (type == WStype_CONNECTED) {
    wsConnected = true;
    Serial.println("WebSocket Connected");
  }
  else if (type == WStype_DISCONNECTED) {
    wsConnected = false;
    Serial.println("WebSocket Disconnected");
  }
}

// ===================================================
// 🔧 CALIBRATION
// ===================================================
void calibrateSensors()
{
  Serial.println("Calibrating... keep hands OFF sensors");

  long sum[6] = {0};

  for (int i = 0; i < 120; i++) {
    for (int j = 0; j < 6; j++) {
      sum[j] += analogRead(ANALOG_PINS[j]);
    }
    delay(5);
  }

  for (int j = 0; j < 6; j++) {
    baseline[j] = sum[j] / 120;
    threshold[j] = baseline[j] + 180;  // stronger threshold = fewer false positives
  }

  Serial.println("Calibration done.");
}

// ===================================================
// 📈 READ SENSOR
// ===================================================
int readFinger(int pin)
{
  long sum = 0;
  for (int i = 0; i < 5; i++) {
    sum += analogRead(pin);
  }
  return sum / 5;
}

// ===================================================
// 📊 READ STATE
// ===================================================
void readState(bool state[6])
{
  for (int i = 0; i < 6; i++) {
    state[i] = readFinger(ANALOG_PINS[i]) > threshold[i];
  }
}

// ===================================================
// 🧠 PRINT ONLY WHEN EVENT HAPPENS
// ===================================================
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

// ===================================================
// 🔤 LETTER DECODER (UNCHANGED)
// ===================================================
char getLetter(bool s[6])
{
  if(s[0]&&!s[1]&&!s[2]&&!s[3]&&!s[4]&&!s[5]) return 'A';
  if(s[0]&&s[1]&&!s[2]&&!s[3]&&!s[4]&&!s[5]) return 'B';
  if(s[0]&&!s[1]&&!s[2]&&s[3]&&!s[4]&&!s[5]) return 'C';
  if(s[0]&&!s[1]&&!s[2]&&s[3]&&s[4]&&!s[5]) return 'D';
  if(s[0]&&!s[1]&&!s[2]&&!s[3]&&s[4]&&!s[5]) return 'E';
  if(s[0]&&s[1]&&!s[2]&&s[3]&&!s[4]&&!s[5]) return 'F';
  if(s[0]&&s[1]&&!s[2]&&s[3]&&s[4]&&!s[5]) return 'G';
  if(s[0]&&s[1]&&!s[2]&&!s[3]&&s[4]&&!s[5]) return 'H';
  if(!s[0]&&s[1]&&!s[2]&&s[3]&&!s[4]&&!s[5]) return 'I';
  if(!s[0]&&s[1]&&!s[2]&&s[3]&&s[4]&&!s[5]) return 'J';
  if(s[0]&&!s[1]&&s[2]&&!s[3]&&!s[4]&&!s[5]) return 'K';
  if(s[0]&&s[1]&&s[2]&&!s[3]&&!s[4]&&!s[5]) return 'L';
  if(s[0]&&!s[1]&&s[2]&&s[3]&&!s[4]&&!s[5]) return 'M';
  if(s[0]&&!s[1]&&s[2]&&s[3]&&s[4]&&!s[5]) return 'N';
  if(s[0]&&!s[1]&&s[2]&&!s[3]&&s[4]&&!s[5]) return 'O';
  if(s[0]&&s[1]&&s[2]&&s[3]&&!s[4]&&!s[5]) return 'P';
  if(s[0]&&s[1]&&s[2]&&s[3]&&s[4]&&!s[5]) return 'Q';
  if(s[0]&&s[1]&&s[2]&&!s[3]&&s[4]&&!s[5]) return 'R';
  if(!s[0]&&s[1]&&s[2]&&s[3]&&!s[4]&&!s[5]) return 'S';
  if(!s[0]&&s[1]&&s[2]&&s[3]&&s[4]&&!s[5]) return 'T';
  if(s[0]&&!s[1]&&s[2]&&!s[3]&&!s[4]&&s[5]) return 'U';
  if(s[0]&&s[1]&&s[2]&&!s[3]&&!s[4]&&s[5]) return 'V';
  if(!s[0]&&s[1]&&!s[2]&&s[3]&&s[4]&&s[5]) return 'W';
  if(s[0]&&!s[1]&&s[2]&&s[3]&&!s[4]&&s[5]) return 'X';
  if(s[0]&&!s[1]&&s[2]&&s[3]&&s[4]&&s[5]) return 'Y';
  if(s[0]&&!s[1]&&s[2]&&!s[3]&&s[4]&&s[5]) return 'Z';


  return '*';
}


// ===================================================
// 🚀 SETUP
// ===================================================
void setup()
{
  Serial.begin(115200);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected");
  Serial.println(WiFi.localIP());

  webSocket.begin(server_ip, server_port, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(2000);

  calibrateSensors();
}

// ===================================================
// 🔁 LOOP
// ===================================================
void loop()
{
  webSocket.loop();

  bool state[6];
  readState(state);

  bool anyPressed = false;
  for (int i = 0; i < 6; i++) {
    if (state[i]) anyPressed = true;
  }

  // ONLY print when finger actually starts pressing
  static bool wasPressed = false;

  if (anyPressed && !wasPressed) {
    printPatternOnce(state, "START");
  }

  // detect letter
  char letter = getLetter(state);

  if (letter != '*' && anyPressed)
  {
    unsigned long now = millis();

    if (now - lastLetterTime > DEBOUNCE_MS)
    {
      printPatternOnce(state, "FINAL");

      Serial.print("LETTER: ");
      Serial.println(letter);

      if (wsConnected)
      {
        String msg = "{\"client\":\"esp32\",\"type\":\"gesture\",\"letter\":\"";
        msg += letter;
        msg += "\"}";
        webSocket.sendTXT(msg);
      }

      lastLetterTime = now;
    }
  }

  wasPressed = anyPressed;

  delay(20);
}
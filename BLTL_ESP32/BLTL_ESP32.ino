/*
  BLTL-GUEST — firmware for the BLTL website (index.html + assets/ in the data folder)
  Board: SparkFun ESP32 Thing Plus (select "Adafruit ESP32 Feather" or "SparkFun ESP32 Thing Plus")

  The website files live in data/ and go to the ESP32's flash with the
  "Upload LittleFS" command (see the instructions that came with this sketch).
  partitions.csv in this folder makes room for them: nothing to choose in Tools.

  Talks to assets/js/deface.js through /state:
    { "charge": 0…1, "log": "1123", "volts": 9.5, "potatoes": 11, "plugged": true }
    log = one digit per attack = its level (1, 2 or 3)
    When the chain is unplugged, the last digit is removed every REPAIR_MS (repair)

  Potatoes (voltage divider ÷11, up to 30 potatoes):
    copper (+) of the last potato ── 1 MΩ ──┬──────────┬──── A2 (GPIO 34)
                                         100 kΩ     100 nF (104)
    zinc   (−) of the first potato ─────────┴──────────┴──── GND

  LCD 16×2 from the Arduino Starter Kit (optional — runs fine without it):
    LCD 1  VSS → GND              LCD 9–10 D2–D3 → nothing
    LCD 2  VDD → VUSB (5 V)       LCD 11 D4 → GPIO 32
    LCD 3  V0  → middle pin of the 10 kΩ potentiometer (outer pins: VUSB and GND)
    LCD 4  RS  → GPIO 27          LCD 12 D5 → GPIO 14
    LCD 5  RW  → GND (important)  LCD 13 D6 → GPIO 26 (A0)
    LCD 6  E   → GPIO 33          LCD 14 D7 → GPIO 25 (A1)
    LCD 7–8 D0–D1 → nothing       LCD 15 A (backlight +) → 220 Ω → VUSB (5 V)
                                  LCD 16 K (backlight −) → GND
*/

#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <LittleFS.h>
#include <LiquidCrystal.h>

// ================= SETTINGS =================
const char* SSID = "BLTL-GUEST";

const int   PIN_POTATOES     = 34;     // A2. Not A0/A1: they can't read analog with WiFi on
const float DIVIDER          = 11.0;   // (1 MΩ + 100 kΩ) / 100 kΩ
const float VOLTS_PER_POTATO = 0.9;

// --- Virtual supercapacitor ---
const float CAP_RESISTANCE = 5;       // charging = volts² / resistance, per second
const float CAP_LEAK       = 1;        // lost per second
const float CAP_THRESHOLD  = 200;      // discharge (attack) when reached
const float LEVEL_VOLTS[2] = { 7.2, 13.5 };  // level 2 from 8 potatoes, 3 from 15

// When the log gets this long, everything resets and the clean site comes back
const int   MAX_LOG = 2000;

// Below this voltage the chain counts as unplugged
const float PLUGGED_VOLTS = 2.8;   // unplugged reads ~1.6 V (ADC offset), 4 potatoes ~4.0 V
// While unplugged, the company repairs the site: one attack undone every…
const unsigned long REPAIR_MS = 20000;

// LCD only (the website uses assets/js/messages.js)
const char* LCD_SLOGANS[] = {
  "Patate libre", "BLTL: Built on Lies!", "Trop c'est trop", "WE ARE NOT YOUR FRIES!",
  "FREE THE POTATOES!", "Patates exploitees, profits demesures", "On germe"
};
const int NUM_SLOGANS = sizeof(LCD_SLOGANS) / sizeof(LCD_SLOGANS[0]);

// ================= STATE =================
float charge = 0;                      // 0 … CAP_THRESHOLD
float lastVolts = 0;
char  attackLog[MAX_LOG + 1] = "";     // "1123…": one digit per attack
int   logLength = 0;
bool  filesOk = false;
unsigned long lastTick = 0, lastLog = 0, lastRepair = 0;

DNSServer dns;
WebServer server(80);
IPAddress apIP(192, 168, 4, 1);

LiquidCrystal lcd(27, 33, 32, 14, 26, 25);   // RS, E, D4, D5, D6, D7
const unsigned long LCD_STEP_MS = 250;
String lcdMsgText;
unsigned long lcdAttackStart = 0, lcdAttackDur = 0, lastLcd = 0;

// ================= POTATOES & CAPACITOR =================
float readVoltage() {
  long sum = 0;
  for (int i = 0; i < 64; i++) sum += analogReadMilliVolts(PIN_POTATOES);
  return (sum / 64.0) / 1000.0 * DIVIDER;   // voltage of the whole potato chain
}

int potatoCount() { return (int)(lastVolts / VOLTS_PER_POTATO + 0.5); }

int levelFor(float volts) {
  return volts >= LEVEL_VOLTS[1] ? 3 : volts >= LEVEL_VOLTS[0] ? 2 : 1;
}

void lcdShowAttack(const char* msg);

void resetAll() {
  logLength = 0;
  attackLog[0] = '\0';
  charge = 0;
  Serial.println("Reset: the pages go back to the clean BLTL site.");
}

void attack() {
  if (logLength >= MAX_LOG) resetAll();
  int level = levelFor(lastVolts);
  attackLog[logLength++] = '0' + level;
  attackLog[logLength] = '\0';
  Serial.printf("ATTACK #%d - level %d (%.1f V)\n", logLength, level, lastVolts);
  lcdShowAttack(LCD_SLOGANS[random(NUM_SLOGANS)]);
}

bool isPlugged() { return lastVolts >= PLUGGED_VOLTS; }

// The company removes the last attack from the log
void repair() {
  logLength--;
  attackLog[logLength] = '\0';
  Serial.printf("REPAIR - %d attacks left\n", logLength);
}

void updateCapacitor() {
  unsigned long now = millis();
  float dt = (now - lastTick) / 1000.0;
  if (dt < 0.1) return;                 // 10× per second
  lastTick = now;

  lastVolts = readVoltage();
  float net = lastVolts * lastVolts / CAP_RESISTANCE - CAP_LEAK;
  charge = max(0.0f, charge + net * dt);
  if (charge >= CAP_THRESHOLD) {
    charge = 0;                         // full discharge
    attack();
  }

  // Unplugged: one repair every REPAIR_MS
  if (isPlugged()) {
    lastRepair = now;
  } else if (logLength > 0 && now - lastRepair >= REPAIR_MS) {
    lastRepair = now;
    repair();
  }

  if (now - lastLog >= 1000) {
    lastLog = now;
    Serial.printf("potatoes %.1f V (~%d) | capacitor %3.0f%% | level %d | attacks %d\n",
                  lastVolts, potatoCount(), 100 * charge / CAP_THRESHOLD,
                  levelFor(lastVolts), logLength);
  }
}

// ================= LCD =================
// The LCD has no accents: É → E, è → e, ç → c … other special characters are dropped
String lcdText(const char* s) {
  String out;
  for (const unsigned char* p = (const unsigned char*)s; *p; p++) {
    if (*p < 0x80) { out += (char)*p; continue; }
    if (*p == 0xC3 && p[1]) {
      int cp = 0x40 + *++p;                       // Unicode U+00C0 … U+00FF
      bool lower = cp >= 0xE0;
      int u = lower ? cp - 0x20 : cp;
      char c = (u <= 0xC5) ? 'A' : (u == 0xC7) ? 'C' : (u >= 0xC8 && u <= 0xCB) ? 'E' :
               (u >= 0xCC && u <= 0xCF) ? 'I' : (u >= 0xD2 && u <= 0xD6) ? 'O' :
               (u >= 0xD9 && u <= 0xDC) ? 'U' : '?';
      if (lower && c != '?') c += 32;
      out += c;
    }
  }
  return out;
}

void lcdShowAttack(const char* msg) {
  lcdMsgText = lcdText(msg);
  int extra = max(0, (int)lcdMsgText.length() - 16);
  lcdAttackDur = (extra + 8) * LCD_STEP_MS;      // pause 1 s, scroll, pause 1 s
  lcdAttackStart = millis();
  lastLcd = 0;                                   // redraw now
}

void updateLcd() {
  unsigned long now = millis();
  if (now - lastLcd < LCD_STEP_MS) return;
  lastLcd = now;
  char line[17];

  if (now - lcdAttackStart < lcdAttackDur) {
    // Attack: number, then the slogan (scrolling if long)
    snprintf(line, sizeof line, "ATTAQUE %-4d    ", logLength);
    lcd.setCursor(0, 0); lcd.print(line);
    int extra = max(0, (int)lcdMsgText.length() - 16);
    int pos = constrain((int)((now - lcdAttackStart) / LCD_STEP_MS) - 4, 0, extra);
    String w = lcdMsgText.substring(pos, pos + 16);
    while (w.length() < 16) w += ' ';
    lcd.setCursor(0, 1); lcd.print(w);
  } else {
    // Normal: voltage, potatoes, charge bar
    snprintf(line, sizeof line, "%5.1fV  %2d pat. ", lastVolts, potatoCount());
    lcd.setCursor(0, 0); lcd.print(line);
    int pct = (int)(100 * charge / CAP_THRESHOLD);
    int cells = pct * 12 / 100;
    lcd.setCursor(0, 1);
    for (int i = 0; i < 12; i++) lcd.write(i < cells ? (uint8_t)0xFF : (uint8_t)'.');  // 0xFF = full block
    snprintf(line, sizeof line, "%3d%%", pct);
    lcd.print(line);
  }
}

// ================= WEB =================
String contentType(const String& path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css"))  return "text/css; charset=utf-8";
  if (path.endsWith(".js"))   return "application/javascript; charset=utf-8";
  if (path.endsWith(".png"))  return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".svg"))  return "image/svg+xml";
  if (path.endsWith(".woff2")) return "font/woff2";
  if (path.endsWith(".woff")) return "font/woff";
  return "application/octet-stream";
}

// Sends a file from LittleFS.
void sendFile(const String& path, const char* cache) {
  File f = LittleFS.open(path, "r");
  if (!f || f.isDirectory()) { server.send(404, "text/plain", "Not found"); return; }
  size_t size = f.size();

  server.sendHeader("Cache-Control", cache);
  server.setContentLength(size);
  server.send(200, contentType(path), "");
  if (server.method() != HTTP_HEAD && size) {
    static uint8_t buf[2048];
    size_t n;
    while ((n = f.read(buf, sizeof(buf))) > 0) {
      if (!server.client().connected()) break;
      server.client().write(buf, n);
    }
  }
  f.close();
}

void handleRoot() {
  if (!filesOk) {
    server.send(500, "text/plain; charset=utf-8",
                "BLTL: website files missing. Upload the data folder with \"Upload LittleFS\".");
    return;
  }
  sendFile("/index.html", "no-cache");
}

void handleState() {
  String json;
  json.reserve(logLength + 100);
  json += "{\"charge\":";   json += String(min(1.0f, charge / CAP_THRESHOLD), 3);
  json += ",\"log\":\"";    json += attackLog;
  json += "\",\"volts\":";  json += String(lastVolts, 2);
  json += ",\"potatoes\":"; json += potatoCount();
  json += ",\"plugged\":";  json += isPlugged() ? "true" : "false";
  json += "}";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", json);
}

void redirectToPortal() {
  server.sendHeader("Location", "http://192.168.4.1/", true);
  server.send(302, "text/plain", "");
}

// Website files (assets/…), anything else → the BLTL page (captive portal)
void handleOther() {
  String path = server.uri();
  if (filesOk && path.indexOf("..") < 0 && path != "/" && LittleFS.exists(path)) {
    sendFile(path, "max-age=86400");
  } else {
    redirectToPortal();
  }
}

// ================= MAIN =================
void setup() {
  Serial.begin(115200);
  delay(300);
  randomSeed(esp_random());

  analogSetPinAttenuation(PIN_POTATOES, ADC_11db);   // range ~0–3.1 V

  lcd.begin(16, 2);
  lcd.print("   BLTL-GUEST   ");
  lcd.setCursor(0, 1);
  lcd.print("patates: pret.  ");

  filesOk = LittleFS.begin(false);
  if (filesOk) {
    Serial.printf("Website files: %u KB used of %u KB\n",
                  (unsigned)(LittleFS.usedBytes() / 1024), (unsigned)(LittleFS.totalBytes() / 1024));
  } else {
    Serial.println("!! Website files not found: upload the data folder with \"Upload LittleFS\".");
  }

  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(SSID, NULL, 6, 0, 8);                   // open network, channel 6, max 8 visitors

  dns.start(53, "*", apIP);                           // every domain → the ESP32

  server.on("/", handleRoot);
  server.on("/index.html", handleRoot);
  server.on("/state", handleState);
  // Phone / laptop "is there internet?" checks → show the portal
  const char* probes[] = {
    "/generate_204", "/gen_204", "/hotspot-detect.html", "/library/test/success.html",
    "/connecttest.txt", "/ncsi.txt", "/redirect", "/fwlink", "/canonical.html", "/success.txt"
  };
  for (const char* p : probes) server.on(p, redirectToPortal);
  server.onNotFound(handleOther);
  server.begin();

  lastTick = millis();
  Serial.printf("\nBLTL-GUEST up at %s - the potatoes are watching.\n",
                WiFi.softAPIP().toString().c_str());
}

void loop() {
  dns.processNextRequest();
  server.handleClient();
  updateCapacitor();
  updateLcd();
}

# BLTL — potato art project

Art project critiquing potato over-production. **BLTL** is a fake industrial potato company.
Its one-page website is served offline by an ESP32 captive portal (WiFi `BLTL-GUEST`).
Surplus potatoes wired in series charge a virtual supercapacitor; each discharge "attacks"
the site and replaces its content with the potatoes' propaganda. More potatoes = faster
attacks; when the power drops, attacks slow down and stop.

The site must first look like a real, believable corporate website. The defacement is layered on top.

## Structure

```
index.html                   the only page (no navbar, one page by design)
assets/css/variables.css     all theme values: colours, fonts, sizes, breakpoints, defacement colours
assets/css/style.css         the corporate site, mobile first
assets/css/deface.css        attack effects (stages, graffiti, posters, overload, crash screen, sim panel)
assets/js/messages.js        propaganda texts (French), poster/photo/sound file lists, crash text — edited by the artists
assets/js/deface.js          polls /state, applies attacks, simulation mode
assets/fonts/                MuseoModerno (logo), Credible subset woff2 (defacement)
assets/fonts-src/            full Credible .woff, source for re-subsetting — NOT on the board
assets/images/               hero.jpg, photo-*.jpg (corporate), poster-*.jpg, waste-*.jpg (defacement)
assets/sounds/               mp3, mono 32 kbps (level 3 attacks)
assets/defaced-sources/      artists' raw material (images, mp3) — NOT on the board until optimised and renamed
esp32/bltl_portal/           Arduino firmware + sync-data.sh (copies the site into data/ for LittleFS)
esp32/README.md              potato wiring, upload steps, levels and pace table
```

## Hard constraints (ESP32 captive portal)

- **No internet for visitors.** Never load anything external: no CDN, Google Fonts, maps, analytics. Everything is a local file.
- **No frameworks or libraries.** Plain HTML, CSS and vanilla JS only.
- **Size budget:** the board uses the "No OTA (2MB APP/2MB SPIFFS)" partition: ~1.9 MB of LittleFS. The site is ~1.5 MB today. Resize photos (≤800 px for defacement, ≤1600 px hero, JPEG ~q62), sounds mono 32 kbps (`ffmpeg -ac 1 -ar 22050 -b:a 32k`), fonts as subset woff2.
- **Credible font:** subset from `assets/fonts-src/credible.woff` with pyftsubset (fonttools) to Latin + French characters. If new messages use other characters, re-subset or they fall back to Courier.
- **File names:** short, lowercase, no spaces or accents. Anything the page uses must live in `assets/css|js|fonts|images|sounds` (that is what sync-data.sh copies).
- The ESP32 web server handles one request at a time: keep the number of files small.

## Conventions

- **variables.css** follows the artist's house style: short `:root` names (`--background`, `--text`, `--text-light`, `--primary-color`, `--color-1…4`, `--inner-width`, `--big-text`, `--h2…h4`, `--side-gap`), mobile first, overridden in
  `@media only screen and (min-device-width: 780px) and (min-width: 780px)` and the same at `1024px`.
  New colours/sizes go there, not hard-coded in style.css or deface.css.
- **style.css** is mobile first: base rules for phones, breakpoints only add layout. Same breakpoints as variables.css.
- Container: `.inner` = `min(100% - 2 × --side-gap, --inner-width)`.
- Corporate copy is in English, believable, quietly obsessed with uniformity and volume. Propaganda messages are in French.
- The artists edit files directly in between sessions: re-read a file before changing it and keep their changes.

## Defacement logic

- ESP32 exposes `GET /state` → `{"volts", "charge" (0–1), "level", "log", "crash"}`; `deface.js` polls it every second.
  `log` is one digit per attack = the level it had (e.g. `"1122333"`).
- Virtual capacitor: `power = V² / RESISTANCE`, `charge += (power − LEAK) × dt`, attack when `charge ≥ THRESHOLD`.
- Level of an attack from the potato voltage at that moment, cumulative: 1 text (text + graffiti),
  2 images (+ poster + corporate photo swapped, from 8 potatoes), 3 sound (+ sticker + mp3, from 15 potatoes).
- Each attack adds `level` elements; at `CRASH.elements` (40) the server crashes for 30 s, then clears the log → pages reload clean.
  Near the crash (75 %) the page trembles (`.overload`).
- **Keep `CAP`, `LEVEL_VOLTS`, `CRASH` in `assets/js/deface.js` and the constants in `bltl_portal.ino` in sync.**
- Attacks are deterministic (seeded random by attack number), so every visitor sees the same damage.
  The page replays the log on load; a shorter log from the server means a reset/crash end → reload.
- Site-wide stages by attack count: `STAGES = [1, 5, 9, 13]` → classes `deface-1…4` on `<html>`.
- Sound needs one tap from the visitor first (autoplay rule); the firmware serves mp3 with Range requests (required by iOS).
- The log persists on the ESP32 (NVS); hold BOOT 3 s to reset.

## Testing

- Open `index.html` as a file (or `?sim`): a simulation panel replaces the ESP32 (potato slider, Attack, Reset).
  `index.html?sim&log=111122223333` replays a history (one digit per attack = its level).
- Headless screenshots: Brave at `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser --headless=new`.
  Pass `--screen-info='{1600x1000}'` or the `min-device-width` breakpoints won't fire; headless can't go below
  ~500 px wide, so test phone width in a 390 px iframe.
- No Arduino toolchain on this machine: the firmware is compiled and uploaded by the artists (Arduino IDE 2 + arduino-littlefs-upload).
- After any site change, run `esp32/bltl_portal/sync-data.sh` before uploading to the board.

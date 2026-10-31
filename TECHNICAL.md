# Technical guide

## 1. Install (Arduino IDE 2.2.1 or newer)

1. **ESP32 boards:** in *Settings → Additional boards manager URLs*, add:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   Then install **esp32 by Espressif Systems** from the Boards Manager.
2. **Library:** install **LiquidCrystal** from the Library Manager.
3. **LittleFS plugin:** download the `.vsix` from [arduino-littlefs-upload](https://github.com/earlephilhower/arduino-littlefs-upload/releases), put it in `~/.arduinoIDE/plugins/` (create the folder if needed), then restart the IDE.

## 2. Upload

1. Open `BLTL_ESP32/BLTL_ESP32.ino` and connect the board over USB.
2. In *Tools*, choose:
   - **Board:** SparkFun ESP32 Thing Plus
   - **Partition Scheme:** Default (6.25MB APP/OTA/3.43MB SPIFFS)
   - **Port:** your board's USB port
3. **Upload the program:** click *Upload*.
4. **Upload the website:** close the Serial Monitor, press `Cmd/Ctrl + Shift + P`, then run **Upload LittleFS to Pico/ESP8266/ESP32**. This sends the `data/` folder to the board.

Repeat step 3 when the `.ino` changes, and step 4 when anything in `data/` changes.

The website is about 3.2 MB, so it needs the 3.43 MB partition. It doesn't fit on a 4 MB board with the *Adafruit ESP32 Feather* layouts.

**Check it works:** the Serial Monitor (115200 baud) prints the board's address. Join the `BLTL-GUEST` Wi-Fi and the site opens at `http://192.168.4.1`.

## 3. Schematic

The potatoes are wired in series, zinc (−) of one to copper (+) of the next. The chain goes through a voltage divider because it reaches about 27 V, and the ESP32 pin reads about 3 V at most.

```
 copper (+), last potato ──[ R1 1 MΩ ]──┬───────────┬──── A2 (GPIO 34)
                                        │           │
                                   R2 100 kΩ    C1 100 nF
                                        │           │
 zinc (−), first potato ────────────────┴───────────┴──── GND
```

| Part | Value | Role |
|---|---|---|
| R1 | 1 MΩ | Top of the divider |
| R2 | 100 kΩ | Bottom of the divider: the pin sees the chain voltage ÷ 11 |
| C1 | 100 nF (marked 104) | Smooths the reading |

- **Range:** one potato gives about 0.9 V. 30 potatoes give about 27 V, which is about 2.45 V at the pin.
- **Unplugged:** anything under 2.8 V counts as unplugged and shows 0 V, so the chain needs at least 4 potatoes.
- **The supercapacitor is simulated:** it's a value in the firmware (`CAP_THRESHOLD`), not a component. C1 only filters the signal and stores no energy for the attacks.

The optional 16×2 LCD wiring is at the top of `BLTL_ESP32.ino`.

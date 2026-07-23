# StokManager Scanner — Carrier PCB (KiCad)

Carrier / breakout board for the ESP32 + GM67 barcode inventory scanner.

**Approach:** compact **double-sided (2-layer)** modular carrier (not bare ESP32-WROOM reflow).  
Mounts **ESP32-DevKitC / 30-pin**, **OLED 0.96" I2C**, **GM67**, **TP4056**, **boost 5V**, **Li-Po**, **3 buttons**, **battery ADC divider**.

| Rev | Board | Notes |
|---|---|---|
| 0.1 | 80×50 mm | single-side oriented draft |
| **0.2-ds** | **55×32 mm** | **double-sided compact** (current) |

## Open in KiCad

1. Install [KiCad 8+](https://www.kicad.org/download/) (Windows/macOS/Linux).
2. File → Open Project → `stokmanager-scanner.kicad_pro`
3. Open schematic `stokmanager-scanner.kicad_sch`
4. Open PCB `stokmanager-scanner.kicad_pcb`
5. Update PCB from schematic: **Tools → Update PCB from Schematic (F8)**
6. Route remaining tracks / adjust footprints to your actual modules
7. Plot Gerbers: **File → Fabrication Outputs → Gerbers**

> Schematic nets + power + connectors are defined.  
> Footprints use common generic / module outlines — **measure your GM67 / TP4056 / boost boards** and replace footprints before fab.

## Design goals

| Goal | Choice |
|---|---|
| Match firmware pins | GPIO from `GM67_ESP32_BARCODESCANNER.ino` |
| Include buttons | UP=32, OK=33, DOWN=25 (missing on Cirkit diagram) |
| Battery sense | GPIO34 + 2×100k + 100nF |
| Power | Li-Po → TP4056 → boost 5V → ESP 5V / VIN + GM67 VCC |
| OLED | 3.3V I2C |
| Fabrication | **2-layer double-sided**, **55×32 mm**, 1.2 mm, ≥0.2 mm clearance |
| Layer split | TOP: ESP+OLED+BTN+ADC · BOTTOM: TP4056+boost+LiPo |

## Pin map (firmware v6.7.x)

| Net | ESP32 GPIO | Connector |
|---|---|---|
| OLED_SDA | 21 | J_OLED.SDA |
| OLED_SCL | 22 | J_OLED.SCL |
| GM67_RX (ESP RX2) | 16 | J_GM67.TX (scanner TX → ESP RX) |
| GM67_TX (ESP TX2) | 17 | J_GM67.RX (ESP TX → scanner RX) |
| VBAT_SENSE | 34 | Divider mid-point |
| BTN_UP | 32 | SW_UP to GND (INPUT_PULLUP) |
| BTN_OK | 33 | SW_OK to GND |
| BTN_DOWN | 25 | SW_DOWN to GND |
| GND | GND | common |
| +3V3 | 3V3 | OLED VCC |
| +5V | VIN/5V | GM67 VCC, after boost |

## Power tree

```
USB (TP4056 micro-USB) ──► TP4056 ──► B+ / B-
                              │
                         Li-Po 3.7V
                              │
                         B+ ──┬──► Boost IN ──► +5V ──► ESP32 VIN + GM67 VCC
                              │
                              └──► R1 100k ──► VBAT_SENSE(GPIO34) ──► R2 100k ──► GND
                                                    └── C1 100nF ──► GND
ESP32 3V3 ──► OLED VCC
```

**Notes**
- Do **not** power GM67 from 3.3V (use +5V).
- Avoid simultaneous USB-on-ESP + boost without isolation if you see brownouts.
- Buttons: active-low, firmware uses internal pull-up.

## Side assignment (rev 0.2-ds)

| Side | Parts |
|---|---|
| **TOP** | ESP32-DevKit, OLED, SW1–3, R1/R2/C1, J_GM67, J_OLED |
| **BOTTOM** | TP4056, boost module, Li-Po + JST-PH |
| **Through** | GND/+5V vias, mounting holes M2 |

## BOM (v0.2-ds carrier)

| Ref | Value | Footprint / package | Notes |
|---|---|---|---|
| U1 | ESP32-DevKitC / 30-pin | 2×15 2.54mm female header | Or solder module |
| U2 | OLED SSD1306 128×64 I2C | 4-pin 2.54 header | 0x3C |
| U3 | GM67 scanner | 4-pin JST-XH / header | VCC GND TX RX |
| U4 | TP4056 module | module pads / header | with protection preferred |
| U5 | MT3608 boost (or similar) | module pads | set to **5.0V** before load |
| BT1 | Li-Po 3.7V + PCM | JST-PH 2.0 | Match capacity (README 700mAh vs proto 150mAh) |
| R1, R2 | 100k 1% | 0805 | Battery divider |
| C1 | 100nF 50V | 0805 | ADC filter |
| R3–R5 | 10k | 0805 | Optional external pull-up buttons |
| SW1–SW3 | 6×6mm tactile | THT or SMD | UP / OK / DOWN |
| J1 | USB breakout optional | — | Or only TP4056 USB |
| FID / mounting | M2/M3 holes | corners | Align with casing.png |

## Netlist summary

- `GND` common all modules  
- `+5V` ESP VIN + GM67 VCC  
- `+3V3` OLED only  
- `VBAT` battery positive after TP4056  
- `SDA` `SCL` `RXD2` `TXD2` `BTN_*` `VBAT_SENSE`

## Layout tips (2-layer)

1. Keep **antenna side of ESP32** free of copper pour / wires.  
2. Place **ADC divider + C1 close to GPIO34**.  
3. Route **UART GM67** short, away from boost inductor.  
4. Wide pours for **GND** and **+5V** (≥0.5mm power tracks).  
5. Buttons on front edge for casing.  
6. GM67 camera faces outward cutout.  
7. After place: fill GND zone both layers, stitch vias.

## Files

| File | Role |
|---|---|
| `stokmanager-scanner.kicad_pro` | Project |
| `stokmanager-scanner.kicad_sch` | Schematic |
| `stokmanager-scanner.kicad_pcb` | PCB board outline + zones |
| `docs/pinout.md` | Full pin table |
| `docs/bom.csv` | Spreadsheet BOM |

## Status

- [x] Project scaffold  
- [x] Schematic symbols/nets for carrier architecture  
- [x] **Compact double-sided outline 55×32 mm** + layer placement guides  
- [x] GND pour both sides + sample stitch vias  
- [ ] Replace module footprints with measured footprints  
- [ ] Full interactive routing (F8 + route in Pcbnew)  
- [ ] DRC clean  
- [ ] Gerber export for JLCPCB/PCBWay  

## Disclaimer

This is a **starting KiCad project** generated from firmware pinout + `schematic.png`.  
Verify every footprint against physical parts before ordering PCBs.

# Layout guide — compact **double-sided** carrier

| Rev | Size | Stack |
|---|---|---|
| 0.1 | 80×50 mm | mostly single-side modules |
| **0.2-ds** | **55×32 mm** | **2-layer double-sided** |

Thickness: **1.2 mm** (slimmer handheld) or 1.6 mm if preferred.

---

## Layer strategy

| Layer | What lives here |
|---|---|
| **F.Cu / TOP** | ESP32-DevKit, OLED, 3 buttons, ADC divider (R1/R2/C1), GM67 connector |
| **B.Cu / BOTTOM** | TP4056, boost 5V, Li-Po pouch (tape), battery JST |
| **Both** | GND pour + via stitching |
| **Keep-out** | ESP32 antenna (no copper pour under ceramic/PCB ant) |

Cross-layer power: **+5V** and **GND** with **0.8 mm** tracks / multiple vias (0.8/0.4).

---

## TOP view (component side)

```
     55 mm
┌──────────────────────────────┐  ↑
│· silk rev0.2-ds          ·  │  32 mm
│ ┌─────────────┐ ┌─────┐ [J] │
│ │  ESP32-Dev  │ │OLED │ GM67│
│ │  USB ←left  │ │     │ hdr │
│ │  ANT keepout│ └─────┘     │
│ └─────────────┘ [UP OK DN]  │
│                 R1 R2 C1     │
│·                            ·│
└──────────────────────────────┘
```

- USB of DevKit flush to **left** edge (programming).  
- OLED window toward **top/front** of casing.  
- Buttons bottom-right finger reach.  
- GM67 flex/header to **right** so camera faces out.

---

## BOTTOM view (flip board, looking at bottom)

```
┌──────────────────────────────┐
│  TP4056 USB        Boost 5V  │
│  (charge port)     (set 5.00)│
│                              │
│     Li-Po flat (double tape) │
│     JST-PH near bottom edge  │
└──────────────────────────────┘
```

- TP4056 micro-USB accessible from side/bottom cutout.  
- Boost inductor **not** under ESP antenna region on opposite side if possible.  
- Battery flat; no metal under antenna.

---

## Z-stack (thickness budget)

| Layer | ~mm |
|---|---:|
| OLED | 4–6 |
| PCB | 1.2 |
| ESP32 DevKit | 12–14 (headers) |
| Bottom modules | 4–6 |
| Li-Po | 4–8 |
| **Total rough** | **~25–35 mm** casing |

For thinner product later: use **ESP32 bare module / ESP32-S3 mini** (new footprint) instead of full DevKit.

---

## Via / pour rules (compact)

| Net | Track | Via |
|---|---|---|
| GND | pour both sides | 0.6/0.3 every ~5 mm |
| +5V | 0.8–1.0 mm | 0.8/0.4 ×2–4 at ESP VIN |
| +3V3 | 0.4 mm | 0.6/0.3 |
| UART/I2C/BTN | 0.25 mm | as needed |
| VBAT_SENSE | 0.25 mm short | keep analog quiet |

**ADC:** R1/R2/C1 on TOP within **5 mm of GPIO34**, far from boost SW node (use bottom for boost).

---

## Inter-layer power path

```
BOTTOM: LiPo → TP4056 → VBAT → Boost IN → Boost OUT (+5V)
                              │
                              via/track to TOP divider & ESP VIN
TOP:    +5V → ESP32 VIN + GM67 VCC
        ESP 3V3 → OLED
```

---

## Before order checklist

- [ ] Replace generic module footprints with measured outlines  
- [ ] Confirm GM67 pin order on your PCB connector  
- [ ] DevKit pin pitch 2.54 — headers not under OLED collision  
- [ ] F8 update from schematic  
- [ ] Zone fill F.Cu + B.Cu GND  
- [ ] DRC + clearances ≥0.2 mm  
- [ ] Gerber + drill + BOM  

## Fab (JLCPCB)

| Param | Value |
|---|---|
| Layers | **2** |
| Size | **55 × 32 mm** |
| Thickness | 1.2 mm |
| Cu | 1 oz |
| Min track/space | 0.15 / 0.2 |
| Min hole | 0.3 |
| Finish | HASL or ENIG |

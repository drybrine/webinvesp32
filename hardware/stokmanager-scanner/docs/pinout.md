# StokManager Scanner pinout

Source of truth: `GM67_ESP32_BARCODESCANNER/GM67_ESP32_BARCODESCANNER.ino`

## ESP32 GPIO

| GPIO | Net | Direction | Peripheral |
|---:|---|---|---|
| 21 | OLED_SDA | I2C | SSD1306 SDA |
| 22 | OLED_SCL | I2C | SSD1306 SCL |
| 16 | RXD2 | Input | GM67 TX |
| 17 | TXD2 | Output | GM67 RX |
| 34 | VBAT_SENSE | Analog in | Divider mid (input-only pin) |
| 32 | BTN_UP | Input pull-up | Tactile to GND |
| 33 | BTN_OK | Input pull-up | Tactile to GND |
| 25 | BTN_DOWN | Input pull-up | Tactile to GND |
| VIN/5V | +5V | Power | From boost OUT |
| 3V3 | +3V3 | Power | OLED VCC |
| GND | GND | Power | Common |

## Connectors

### J_OLED (4 pin)

| Pin | Net |
|---|---|
| 1 | GND |
| 2 | +3V3 |
| 3 | OLED_SCL |
| 4 | OLED_SDA |

### J_GM67 (4 pin)

| Pin | Net | Wire to scanner |
|---|---|---|
| 1 | GND | GND |
| 2 | +5V | VCC |
| 3 | RXD2 | Scanner **TX** |
| 4 | TXD2 | Scanner **RX** |

### J_BAT (2 pin JST-PH)

| Pin | Net |
|---|---|
| 1 | VBAT (+) |
| 2 | GND (−) |

## Battery ADC

```
VBAT -- R1 100k --+-- GPIO34 (VBAT_SENSE)
                  |
                 C1 100nF
                  |
                 R2 100k
                  |
                 GND
```

- Divider ratio 2.0  
- Firmware MIN 3200 mV / MAX ~3800 mV (calibratable)

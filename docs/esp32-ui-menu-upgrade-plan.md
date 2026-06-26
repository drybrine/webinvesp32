# ESP32 Scanner UI Menu Upgrade Plan

## Tujuan

Upgrade scanner ESP32 menjadi handheld scanner mandiri dengan:

- 3 tombol fisik: `UP`, `OK`, `DOWN`
- OLED menu seperti device handheld
- mode scanner dikontrol dari alat
- website hanya monitor stok dan mode
- auto stock berjalan dari firmware tanpa website terbuka
- screen saver jam/tanggal saat idle

## Hardware Button

| Button | GPIO | Fungsi |
| --- | ---: | --- |
| UP | GPIO32 | navigasi atas |
| OK | GPIO33 | pilih / buka menu |
| DOWN | GPIO25 | navigasi bawah |

Wiring:

- Satu kaki tombol ke GPIO
- Satu kaki tombol ke GND
- Firmware pakai `INPUT_PULLUP`
- Tombol ditekan = `LOW`

Pin yang harus dihindari:

- GPIO16/17: GM67 UART
- GPIO21/22: OLED I2C
- GPIO34: battery ADC
- GPIO0/2/12/15: boot strap pins

## Button Behavior

| Button | Short Press | Long Press |
| --- | --- | --- |
| UP | item sebelumnya | Back |
| OK | pilih / buka menu | Back |
| DOWN | item berikutnya | Home |

Debounce:

- `50ms`
- long press: `800ms`
- non-blocking pakai `millis()`
- tidak pakai `delay()` untuk navigasi

## UI Screens

```cpp
enum UiScreen {
  SCREEN_HOME,
  SCREEN_SAVER,
  SCREEN_MAIN_MENU,
  SCREEN_MODE_MENU,
  SCREEN_MANUAL_STOCK_ACTION,
  SCREEN_BATTERY,
  SCREEN_WIFI,
  SCREEN_STATUS,
  SCREEN_RESTART_CONFIRM
};
```

## Home Screen

```text
SCANNER v6.5.x
[ONLINE] Batt 95%
WiFi: Gudang
Mode: Manual
Scan: 123
```

## Screen Saver

Aktif saat idle 30 detik.

```text
     14:37
  Senin, 26 Jun

Mode: Manual
Batt: 95%  WiFi: OK
```

Exit screen saver:

- tombol ditekan
- barcode discan
- OTA mulai
- WiFi/auth error muncul

Waktu:

- pakai `configTime(7 * 3600, 0, "pool.ntp.org")`
- fallback kalau NTP belum siap:

```text
--:--:--
Sinkron waktu...
```

OLED burn-in prevention:

- geser posisi jam kecil tiap beberapa detik atau menit

## Main Menu

```text
> Mode Scanner
  Status Device
  Battery
  WiFi Info
  Restart
```

## Mode Menu

```text
Pilih Mode:
> Manual
  Auto IN
  Auto OUT
```

Mode values:

```cpp
"Manual"
"Auto IN"
"Auto OUT"
```

Mode setelah reboot:

- selalu balik ke `Manual`
- tidak disimpan ke NVS

## Manual Mode Behavior

Saat scan barcode dikenal:

```text
ITEM DITEMUKAN
Nama Barang
Stok: 12

> Stock IN
  Stock OUT
  Batal
```

Action:

- `Stock IN`: firmware tambah stok `+1`
- `Stock OUT`: firmware kurang stok `-1` kalau stok `> 0`
- `Batal`: tidak ubah stok

Unknown barcode:

- kirim ke `/scans` dengan `processed=false`
- website quick-add tetap jalan

## Auto Mode Behavior

| Mode | Barang dikenal | Barang unknown |
| --- | --- | --- |
| Manual | tampil opsi IN/OUT/Batal | kirim scan ke web |
| Auto IN | langsung stok +1 + transaksi | kirim scan ke web |
| Auto OUT | langsung stok -1 + transaksi | kirim scan ke web |

## Standalone Stock Mutation

Firmware akan update Firebase langsung:

```text
/inventory/{itemId}/quantity
/inventory/{itemId}/operationId
/inventory/{itemId}/updatedByUid
/inventory/{itemId}/lastUpdated
/inventory/{itemId}/updatedAt
/transactions/{txId}
/scans/{scanId}
```

Transaction payload:

```json
{
  "id": "txId",
  "type": "in",
  "productName": "Nama Barang",
  "productBarcode": "BARCODE",
  "quantity": 1,
  "reason": "Stock In via Scanner",
  "operator": "ESP32 Scanner",
  "operatorUid": "device auth uid",
  "operationId": "ESP32-XXXX-millis",
  "timestamp": { ".sv": "timestamp" },
  "notes": "Auto mode via ESP32 firmware"
}
```

## Firebase Rules Needed

Rules harus izinkan device:

- update quantity inventory secara terbatas
- create transaction
- create scan record dengan `processed=true` atau `processed=false`

Rules harus tetap melarang device:

- edit `name`, `category`, `barcode`, `supplier`, dan metadata barang lain
- delete item
- set quantity negatif

## Website Changes

Dashboard:

- hapus tombol mode web
- mode badge jadi read-only
- tampil mode dari `/devices/{deviceId}/scanMode`
- toast saat mode berubah

Realtime scan provider:

- matikan auto stock web
- web hanya monitor scan/stock
- quick-add tetap untuk unknown barcode

## Battery Calibration Menu

Menu battery:

```text
Battery:
95%
Max: 3810mV
> Kalibrasi Full
```

Kalibrasi:

- user tekan OK saat LED biru TP4056 menyala
- firmware sampling ADC
- simpan `maxMv` ke NVS
- report hasil ke Firebase

## Implementation Phases

### Phase 1A: Button + UI Core

- tambah pin button
- debounce
- button event short/long press
- UI state machine
- home screen
- screen saver jam/tanggal

### Phase 1B: Mode Menu

- main menu
- mode menu
- mode dari alat
- heartbeat update mode
- website read-only mode + toast

### Phase 2: Manual Stock Action

- manual scan tampil opsi `Stock IN / Stock OUT / Batal`
- firmware update stok + transaksi
- rules update

### Phase 3: Auto Stock Standalone

- Auto IN/OUT langsung dari firmware
- web auto stock dimatikan total
- website hanya monitor

### Phase 4: Battery Calibration Menu

- menu kalibrasi full battery
- simpan max mV ke NVS
- report result

### Phase 5: Polish

- better error OLED
- mode change toast
- screen saver movement
- UX timeout
- reset/auth troubleshooting menu

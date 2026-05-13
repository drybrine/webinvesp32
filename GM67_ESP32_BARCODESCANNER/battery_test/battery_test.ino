// =============================================================================
//  Battery Voltage Tester - ESP32
//  Untuk kalibrasi voltage divider (R1=R2=100kΩ) di GPIO34
//  Buka Serial Monitor 115200 baud
// =============================================================================

#define BATTERY_PIN       34
#define BATTERY_DIVIDER   2.0f   // (R1+R2)/R2
#define NUM_SAMPLES       20

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n========================================");
  Serial.println("  ESP32 Battery Voltage Tester");
  Serial.println("  Pin: GPIO34 | Divider: 2.0x");
  Serial.println("  R1=100k (B+ ke GPIO34)");
  Serial.println("  R2=100k (GPIO34 ke GND)");
  Serial.println("========================================\n");
  Serial.println("RAW\tADC_mV\tBATT_mV\tVolt");
  Serial.println("---\t------\t-------\t----");
}

void loop() {
  long sum = 0;
  int minVal = 4095, maxVal = 0;

  for (int i = 0; i < NUM_SAMPLES; i++) {
    int val = analogRead(BATTERY_PIN);
    sum += val;
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
    delay(5);
  }

  int raw = sum / NUM_SAMPLES;
  float adcMv = raw * 3300.0f / 4095.0f;
  float battMv = adcMv * BATTERY_DIVIDER;
  float battV = battMv / 1000.0f;

  Serial.printf("%d\t%.0f\t%.0f\t%.2fV\t(min=%d max=%d spread=%d)\n",
    raw, adcMv, battMv, battV, minVal, maxVal, maxVal - minVal);

  delay(2000);
}

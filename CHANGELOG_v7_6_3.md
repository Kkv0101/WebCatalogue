# Changelog — Version 7.6.3

- Applied the new specification section 9 polynomial:

```text
Parameter =
    A
  + Te * B
  + Ta * C
  + Te * Ta * D
  + Te² * E
  + Ta² * F
  + Te² * Ta * G
  + Te * Ta² * H
  + Te³ * I
  + Ta³ * J
```

- Kept the coefficient worksheet name `Curve Coefficients`.
- Rated Point calculation uses Standard `EN13215_RG20`.
- Rated Point temperatures:
  - M/HBP: Te=-10 °C, Ta=32 °C
  - HBP: Te=-10 °C, Ta=32 °C
  - MBP: Te=-10 °C, Ta=32 °C
  - LBP: Te=-35 °C, Ta=32 °C
- Calculates Rated Point:
  - Cooling Capacity
  - Power Consumption
  - Current Consumption
  - COP
- COP = Cooling Capacity / Power Consumption.
- The calculated Rated Point is now exposed as `context.ratedPoints[0]` for
  `parameter_mapping.json`.
- Datasheet Rated Point fields:
  - `RatedCapacity_W`
  - `RatedEfficiency_WW`
  - `RatedPowerConsumption_W`
  - `RatedAmbientTemperature_C`
  - `RatedEvaporatingTemperature_C`
  - `Standard = EN13215 RG20`
- Replaced the project `parameter_mapping.json` with the newly supplied version.
- Added `runRatedPointTest(engineeringCode)` diagnostic.

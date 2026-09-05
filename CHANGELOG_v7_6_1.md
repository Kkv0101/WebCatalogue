# Changelog — Version 7.6.1

- Added homepage product-card values:
  - `CAPACITY (W)`
  - `COP (W/W)`
- Added database loading for:
  - `Curve Coefficients`
  - `StandardTemp`
- Added polynomial calculation according to specification section 9.
- Added homepage rated-point selection according to specification section 9.1.
- Homepage calculation uses Standard `EN13215_RG20`.
- Rated points:
  - `M/HBP`: Te = -10 °C, Ta = 32 °C
  - `HBP`: Te = -10 °C, Ta = 32 °C
  - `MBP`: Te = -10 °C, Ta = 32 °C
  - `LBP`: Te = -35 °C, Ta = 32 °C
- Coefficient row is selected by:
  - `PD_Config`
  - `Refrigerant`
  - `Standard`
- Cooling Capacity uses `CC_J` … `CC_A`.
- Power Consumption uses `CON_J` … `CON_A`.
- Current Consumption uses `CURR_J` … `CURR_A` and is calculated for future use.
- COP is calculated as Cooling Capacity / Power Consumption.
- Product cards display Capacity rounded to the nearest W and COP with two
  decimals.
- Missing/invalid performance data displays `—` instead of fabricating a value.
- Added `runPerformanceCalculationTest()`.

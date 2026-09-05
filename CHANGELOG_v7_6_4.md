# Changelog — Version 7.6.4

- Implemented specification section 9.2.
- Added required `WEB_FOLDER_ID/Performance_Curve.csv`.
- The CSV is filtered by:
  - product refrigerant;
  - Standard `EN13215 RG20`;
  - product Application.
- Each selected CSV row supplies:
  - `Ta_val`;
  - `Te_val`;
  - exact template tags `Te`, `CC`, `COP`, `CON`.
- Cooling Capacity and Power Consumption are calculated with the section 9
  A..J polynomial and the matching `Curve Coefficients` row.
- COP is calculated as Cooling Capacity / Power Consumption.
- Calculated values are mapped directly to the tags specified in the CSV.
- The legacy `parameter_mapping.json.performanceCurves` block is retained in
  the supplied mapping for compatibility, but Version 7.6.4 does not use it
  when `Performance_Curve.csv` context is present.
- Server-side replacement validation recalculates the allowed CSV tags for the
  selected product; arbitrary client-supplied tags remain rejected.
- Added diagnostics:
  - `runPerformanceCurveFileTest()`
  - `runPerformanceCurveTest(engineeringCode)`
- The actual `Performance_Curve.csv` data was not included in the provided
  inputs, so the source package contains only
  `Performance_Curve_TEMPLATE.csv`. Keep/use the real
  `Performance_Curve.csv` already stored in `WEB_FOLDER_ID`.

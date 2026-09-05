# Changelog — Version 7.6.2

- Corrected the worksheet used for polynomial performance coefficients.
- The canonical worksheet name is now `Curve Coefficients`.
- `Config.gs` now defines:
  - `CURVE_COEFFICIENTS_SHEET: 'Curve Coefficients'`
- `WorkbookService.js` loads coefficient rows from this worksheet.
- Homepage Capacity and COP calculation logic is unchanged.
- Matching still uses:
  - `PD_Config`
  - `Refrigerant`
  - `Standard = EN13215_RG20`
- Added `runCurveCoefficientsTest()` for direct worksheet-load diagnostics.

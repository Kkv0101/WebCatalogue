# Migration from Version 7.6.1 to Version 7.6.2

Version 7.6.2 corrects the coefficient worksheet reference to:

```text
Curve Coefficients
```

No Script Property changes are required.

After replacing the updated files, run:

```javascript
runRefreshCatalogueCache();
runCurveCoefficientsTest();
runPerformanceCalculationTest();
runTestConfiguration();
```

`runCurveCoefficientsTest()` should report:

```text
sheetName: Curve Coefficients
loaded: true
rowCount: > 0
```

When `loaded` is false, verify that the worksheet exists in `DATABASE_FILE_ID`
with the exact name `Curve Coefficients`.

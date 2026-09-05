# Migration from Version 7.6.3 to Version 7.6.4

## New required WEB_FOLDER_ID file

```text
Performance_Curve.csv
```

The file must be a direct child of `WEB_FOLDER_ID`.

Required header:

```text
id,refrigerant,standard,Application,Ta_val,Te_val,Te,CC,COP,CON
```

The source package contains `Performance_Curve_TEMPLATE.csv` with only this
header. Do not overwrite your real `Performance_Curve.csv` with the template.

## Updated source files

Replace the complete Apps Script project and updated WEB files.

The main changed files are:

```text
AppsScript_Project/Config.gs
AppsScript_Project/ProductRepository.gs
AppsScript_Project/RuntimeModuleLoader.gs
AppsScript_Project/ServerApi.gs

Folder2_Web_Files/DriveFileService.js
Folder2_Web_Files/DocxPdfService.js
Folder2_Web_Files/CatalogueService.js
Folder2_Web_Files/TemplateMappingService.js
Folder2_Web_Files/WorkbookService.js
Folder2_Web_Files/catalogue-config.json
Folder2_Web_Files/parameter_mapping.json
```

## Test

After uploading the source files and confirming the real
`Performance_Curve.csv` is present in `WEB_FOLDER_ID`, run:

```javascript
runRefreshCatalogueCache();
runPerformanceCurveFileTest();
runCurveCoefficientsTest();
runPerformanceCalculationTest();
runTestConfiguration();
```

For a specific product, use a wrapper:

```javascript
function testPerformanceCurve() {
  return runPerformanceCurveTest(
    'ENGINEERING_CODE'
  );
}
```

Expected product-specific result:

```text
status: ok
matchingRows: > 0
calculatedRows: [...]
replacements: {
  <Te tag>: <Te>,
  <CC tag>: <Cooling Capacity>,
  <COP tag>: <COP>,
  <CON tag>: <Power Consumption>
}
```

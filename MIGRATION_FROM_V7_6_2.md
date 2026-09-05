# Migration from Version 7.6.2 to Version 7.6.3

Replace the complete Version 7.6.2 project with Version 7.6.3.

Important changed files:

```text
AppsScript_Project/Config.gs
AppsScript_Project/ProductRepository.gs
AppsScript_Project/ServerApi.gs

Folder2_Web_Files/parameter_mapping.json
Folder2_Web_Files/WorkbookService.js
Folder2_Web_Files/TemplateMappingService.js
Folder2_Web_Files/CatalogueService.js
Folder2_Web_Files/DriveFileService.js
Folder2_Web_Files/DocxPdfService.js
Folder2_Web_Files/catalogue-config.json

specification.md
```

No Script Property changes are required.

After uploading files:

```javascript
runRefreshCatalogueCache();
runCurveCoefficientsTest();
runPerformanceCalculationTest();
runTestConfiguration();
```

For a specific product:

```javascript
runRatedPointTest('ENGINEERING_CODE');
```

The result should contain:

```text
ratedPoint.status: ok
ratedPoint.available: true
datasheetRatedPoint.RatedCapacity_W
datasheetRatedPoint.RatedEfficiency_WW
datasheetRatedPoint.RatedPowerConsumption_W
datasheetRatedPoint.RatedAmbientTemperature_C
datasheetRatedPoint.RatedEvaporatingTemperature_C
datasheetRatedPoint.Standard = EN13215 RG20
```

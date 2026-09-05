# Migration from Version 7.6.5 to Version 7.6.6

Replace the Version 7.6.5 source files with the Version 7.6.6 files.

The most important updated files are:

```text
AppsScript_Project/ProductRepository.gs
AppsScript_Project/Config.gs

Folder2_Web_Files/CatalogueService.js
Folder2_Web_Files/DocxPdfService.js
Folder2_Web_Files/TemplateMappingService.js
Folder2_Web_Files/catalogue-config.json
```

Keep the real:

```text
WEB_FOLDER_ID/Performance_Curve.csv
```

in the same folder.

After uploading the updated files:

```javascript
runRefreshCatalogueCache();
runPerformanceCurveFileTest();
```

For UNEU2155U / 562KAE004AA use:

```javascript
function testUNEU2155U() {
  return runPerformanceCurveTest(
    '562KAE004AA'
  );
}
```

Then generate the PDF again.

The PDF generation result should report:

```text
performanceCurveStatus: ok
performanceCurveMatchedRows: > 0
performanceCurveMatchedTagGroups: > 0
```

The detailed table should no longer contain raw tags such as:

```text
Te1-1
CAP1-1
CC1-1
COP1-1
CON1-1
```

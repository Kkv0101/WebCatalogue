# Migration from Version 7.5 to Version 7.6

## Replace source files

Replace the complete Apps Script project and the files in `WEB_FOLDER_ID`.

Important updated files:

```text
AppsScript_Project/Config.gs
AppsScript_Project/RuntimeModuleLoader.gs
AppsScript_Project/ServerApi.gs

Folder2_Web_Files/DriveFileService.js
Folder2_Web_Files/DocxPdfService.js
Folder2_Web_Files/CatalogueService.js
Folder2_Web_Files/TemplateMappingService.js
Folder2_Web_Files/catalogue-config.json
Folder2_Web_Files/parameter_mapping.json
Folder2_Web_Files/DatasheetTemplate.docx
```

## Graphic folders

Version 7.6 supports the existing four Script Properties:

```text
GRAPHIC_3D_FOLDER_ID
GRAPHIC_DIMENSIONS_FOLDER_ID
GRAPHIC_ELECTRICAL_FOLDER_ID
GRAPHIC_ENVELOPE_FOLDER_ID
```

Configure them with:

```javascript
setupGraphicFolders(
  'DRAWING_3D_FOLDER_ID',
  'EXTERNAL_DIMENSIONS_FOLDER_ID',
  'ELECTRICAL_DIAGRAM_FOLDER_ID',
  'OPERATING_ENVELOPE_FOLDER_ID'
);
```

When a dedicated property is missing, the application searches
`DATA_FOLDER_ID` for that category.

## Accepted files

```text
.png
.jpg
.jpeg
```

Database values may contain the full filename or only the filename stem.

## Tests

Run:

```javascript
runServerModuleTest();
runTestConfiguration();
runTemplateImageDescriptionTest();
runTemplateGenerationTest();
runRefreshCatalogueCache();
```

`runTemplateImageDescriptionTest()` must return:

```text
missing: []
```

and must list:

```text
img_3D
img_Dimensions
img_Wiring
img_Envelope
```

Then open the `/dev` deployment and generate a datasheet for a product whose
four database graphic fields contain valid filenames.

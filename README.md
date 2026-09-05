# Product Catalogue v7.6

## Image replacement

The application replaces four images in `DatasheetTemplate.docx` before PDF
export.

| Database source | Template Image Description |
|---|---|
| `DRAWING_3d` | `img_3D` |
| `EXTERNAL_DIMENSIONS` | `img_Dimensions` |
| `ELECTRICAL_DIAGRAM` | `img_Wiring` |
| `ENVELOPE` | `img_Envelope` |

The tags are configured in `parameter_mapping.json`.

## Graphic file locations

Preferred dedicated Script Properties:

```text
GRAPHIC_3D_FOLDER_ID
GRAPHIC_DIMENSIONS_FOLDER_ID
GRAPHIC_ELECTRICAL_FOLDER_ID
GRAPHIC_ENVELOPE_FOLDER_ID
```

When a dedicated folder is missing, Version 7.6 searches `DATA_FOLDER_ID`.

## Accepted formats

```text
PNG
JPG
JPEG
```

Filename matching is case-insensitive.

Examples:

```text
Database value: 662FA0012_3D
Drive file:     662FA0012_3D.PNG

Database value: CSIR_EU.jpg
Drive file:     CSIR_EU.jpg
```

When no extension is specified and several formats exist, PNG is preferred.

## Missing image behavior

The original template image is kept when:

- the database graphic value is empty;
- the graphic file is not found;
- the Image Description is missing after DOCX conversion;
- the image format is unsupported;
- insertion fails.

The PDF is still generated and the application reports a warning.

## Image sizing

The replacement image preserves its own aspect ratio. For `img_3D`, the height
is fixed at 6 cm (227 pixels, rounded to DocumentApp's integer pixel units),
and the width is scaled proportionally, even if it exceeds the original
placeholder. All other images are fitted inside the width and height of the
original template image.

## Tests

```javascript
runServerModuleTest();
runTestConfiguration();
runTemplateImageDescriptionTest();
runTemplateGenerationTest();
runRefreshCatalogueCache();
```

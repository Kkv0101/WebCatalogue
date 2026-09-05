# Changelog — Version 7.6

- Added runtime replacement of four images inside `DatasheetTemplate.docx`.
- Image placeholders are identified by exact Image Description:
  - `img_3D`
  - `img_Dimensions`
  - `img_Wiring`
  - `img_Envelope`
- Updated `parameter_mapping.json`:
  - `DRAWING_3d` → `img_3D`
  - `EXTERNAL_DIMENSIONS` → `img_Dimensions`
  - `ELECTRICAL_DIAGRAM` → `img_Wiring`
  - `ENVELOPE` → `img_Envelope`
- Added PNG, JPG and JPEG graphic-file support.
- Added case-insensitive exact filename and filename-stem matching.
- PNG is preferred when a database value omits the extension.
- Added aspect-ratio-preserving `contain` fitting inside the original image
  placeholder.
- Missing database values, files or image descriptions keep the original
  template image and generate a warning.
- Re-enabled the four dedicated graphic-folder Script Properties.
- Added fallback to `DATA_FOLDER_ID` when a dedicated graphic folder is not
  configured.
- Added `runTemplateImageDescriptionTest()`.

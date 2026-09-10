# Initial screen — approved grouped catalogue design

The homepage implements the approved UI concept: a charcoal filter toolbar,
a Product catalogue / Condensing Units heading, and expandable model cards.
Each card contains a drawing, model name, engineering-code count and a table
with blue Datasheet actions.

## Layout and interaction

- Model and Engineering Code are text fields: typing part of a name or code
  immediately updates model groups, engineering codes and counts, without
  pressing Enter. Matching ignores case and surrounding whitespace. Deleting
  the text removes that filter. Filtering preserves the text and caret.
- Refrigerant, Frequency / Rotation, Power Supply and Standard are dropdowns.
  Standard contains exactly EN13215 RG20 and EN13215 SH10, with RG20 selected
  at startup. It selects the calculation standard rather than excluding rows
  by a stored product label. Clear filters also restores RG20.
  Cooling Capacity and COP accept inclusive minimum numeric values. Empty or
  invalid numeric input does not restrict results; missing product values are
  excluded when a numeric minimum is active. Zero is a valid minimum.
  All eight filters combine, so all engineering
  codes belonging to matching models are shown unless another filter restricts
  them. Clear filters resets filters, model text and direct-link restrictions.
- The page reports both visible model and engineering-code counts. Each badge
  counts the visible variants in that model.
- Model cards are expanded initially. Their native buttons support keyboard
  activation and expose expanded state. Collapse state survives filtering and
  sorting for the current page session.
- Each model has nine table columns, matching the approved unified-header design:
  Model, Engineering Code, Refrigerant, Frequency / Rotation, Power Supply,
  Cooling Capacity [W], COP [W/W], Standard and the Datasheet action.
  The last header cell contains only Clear filters, with no visible Documents
  label. The model name appears in each row as well as the group heading.
- Refrigerant, Frequency / Rotation, Cooling Capacity and COP each occupy 9%
  of the table, with centered values. Rated values use a subtle teal highlight.
  Model occupies 15%, Engineering Code 13%, Power Supply 14%, Standard 12% and
  Datasheet 10%. Standard values are centered. Tables scroll horizontally below
  their 1660 px minimum width.
- Rated values come from ratedPointsByStandard[chosenStandard].coolingCapacityW
  and .copWW. The backend calculates both standards from coefficient rows
  matched by PD_Config, refrigerant and Standard. It retains the existing
  application-specific Rated Point temperatures and computes COP as capacity
  divided by power consumption. Both sets arrive in the bootstrap response;
  switching is immediate and reapplies numeric minima and sorting.
  Cooling Capacity displays whole watts and COP displays two decimal places.
  Missing or non-finite values display an em dash; zero remains visible. Sorting
  uses unrounded numeric values and leaves missing values last in both directions.
  Products without coefficients for the chosen standard stay visible with
  missing values, unless a numeric filter excludes them. Values never fall
  back to another standard. Legacy ratedPoint/performance payloads are accepted
  only when their explicit standard matches the selection.
- The Standard cell displays the selected standard. The compatibility fields
  ratedPoint and performance in catalogue summaries retain RG20 for existing
  callers; datasheet contexts calculate the explicitly requested standard.
- Each Datasheet action captures the selected standard at click time. Both API
  requests, the Rated Point, CSV curve definition selection and coefficients,
  server text replacements, and final DOCX/PDF generation use that standard.
  Changing the catalogue selection while a request runs cannot mix standards.
  The generated filename includes EN13215_RG20 or EN13215_SH10.
  Missing coefficient/CSV data produce the existing -- placeholders and warnings,
  never data from the other standard. Calls omitting the standard default to RG20.
- The page explains that Rated Point values use the standard shown in each row.
- A single sticky dark row combines parameter names, sorting buttons and filter
  controls aligned with the data columns. There is no separate filter toolbar
  or repeated parameter row. Model cards do not repeat the visible labels;
  their tables retain hidden column headings for screen readers.
- Models sort naturally by name. All model tables initially sort by engineering
  code ascending. The shared header arrows sort variants in every model table
  together. Sorting Model changes group order. Missing values stay last.
  Sorting preserves filter controls and entered values.
- A model uses the first visible variant with a drawing reference. Thumbnail
  requests use the existing authenticated API, a maximum of three simultaneous
  requests, and an in-page cache. Missing images use the existing line drawing.
- Every PDF action targets its own engineering code and preserves the existing
  synchronous popup opening, template mapping and server PDF generation flow.
- Existing ?product= links select the matching engineering code or model without
  opening a popup automatically. Clear filters returns to the full catalogue.
- On smaller screens the unified header remains a single sticky row and scrolls
  horizontally. Horizontal scrolling is synchronized between the header and all
  expanded tables, including after filtering or reopening a model. Model names
  remain on one line. Keyboard focus is retained after sorting. Scroll padding
  follows the measured toolbar and header height.

The optional ui.catalogueHeading configuration overrides the visible
Condensing Units heading. Existing ui.appTitle still controls the browser title.

## Deployment

For the datasheet standard update, upload Folder2_Web_Files/app.js,
Folder2_Web_Files/CatalogueService.js and Folder2_Web_Files/DocxPdfService.js to
WEB_FOLDER_ID. Update AppsScript_Project/ProductRepository.gs and
AppsScript_Project/ServerApi.gs, retaining the previously updated Config.gs
with both allowed standards, then deploy a new Apps Script version and reload
the web app. Performance_Curve.csv already contains both RG20 and SH10 grids;
ensure the current workspace version is uploaded if the Drive copy is older.
No template or parameter_mapping.json changes are needed.

For the RG20/SH10 calculation update, upload Folder2_Web_Files/app.js to the
Shared Drive WEB_FOLDER_ID folder, update AppsScript_Project/Config.gs and
AppsScript_Project/ProductRepository.gs in Apps Script, and deploy a new
Apps Script version. Deploy the backend with both-standard payloads before
the new frontend. Existing data/cache refresh procedures still apply when
coefficient data in the workbook changes.

For an installation with the earlier thumbnail API already deployed, update
these three files in the Shared Drive folder configured by WEB_FOLDER_ID:

- Folder2_Web_Files/index.html
- Folder2_Web_Files/styles.css
- Folder2_Web_Files/app.js

Then reload the deployed web app. This redesign does not require backend source
changes or new Script Properties. Keep the frontend files encoded as UTF-8
without BOM because Apps Script injects the stylesheet into an inline style tag.

If the earlier thumbnail backend has not yet been deployed, also upload the
existing Folder2_Web_Files/CatalogueService.js and update these Apps Script sources
from the workspace together:

- AppsScript_Project/ProductRepository.gs
- AppsScript_Project/RuntimeModuleLoader.gs
- AppsScript_Project/ServerApi.gs

Deploy a new Apps Script version only when updating those server sources.
Drawings use GRAPHIC_3D_FOLDER_ID, falling back to DATA_FOLDER_ID. Files remain
private. The Apps Script project contains only .gs files and appsscript.json;
frontend and server-side JavaScript modules remain on Shared Drive.

## Verification

tests/datasheet-standards.cjs verifies the actual calculation and mapping code
for both standards, including different CSV temperatures, CC/CAP aliases,
missing data, authoritative server Rated Point/curve replacements over stale
browser values, API and final PDF-layer parameter forwarding, filenames, and
the async browser request flow while the selected standard changes mid-request.
It also checks both standards against the checked-in Performance_Curve.csv.
Run from the repository root with `node tests/datasheet-standards.cjs`.
The Google Drive/Docs conversion itself is mocked locally; actual PDF rendering
must be verified after deployment in the authenticated Workspace environment.

The RG20/SH10 update passed the calculation regression suite in
tests/rated-standards.cjs, plus 21 desktop and 22 mobile browser checks using
bootstrap payloads produced by the actual repository calculation functions.
These cover the two options and default, independent coefficients and COP,
missing SH10 data, sort/minimum updates, filter preservation, reset, rapid
switching without extra API calls, sticky positioning and scroll alignment.
The calculation suite covers all supported application temperatures, matching
PD_Config/refrigerant/standard, invalid coefficients, zero consumption, the
ten-term polynomial and compatibility fields. Run it from the repository root
with `node tests/rated-standards.cjs`.

The unified-header update passed 28 desktop browser checks, 31 browser checks
at a 390 px viewport, and four direct-product-link checks. These cover the single
row, nine columns, absence of Documents text, eight filters and sort controls,
equal widths, centering, live text filtering, combined numeric/dropdown filters,
zero and invalid minima, missing values, empty results, input/caret retention,
sorting without losing filters, model ordering, PDF row targets, sticky
positioning, synchronized scrolling, reopening models and page overflow.
Direct links retain exact code/model matching even when another value shares
the same prefix; typing switches the edited field to partial matching.
JavaScript syntax and whitespace checks passed for the changed frontend files.
The browser checks use local fixtures and mocked Apps Script calls.

catalogue-preview.png shows the current desktop layout with sample rows and
placeholder drawings. Live Workspace data, actual Drive images and generated
PDF content still require verification in the deployed web app.

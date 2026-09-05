# Changelog — Version 7.6.6

## Fixed: detailed performance tags remained visible in generated PDF

The previous flow calculated detailed performance values correctly in
`ProductRepository.gs`, but PDF generation still depended on the browser to
include these dynamic values in the replacement map.

Version 7.6.6 changes this behavior:

1. `CatalogueService.js` recalculates `Performance_Curve.csv` values on the
   server for the selected product.
2. Server-calculated values are merged into the replacement map immediately
   before DOCX/Google Docs replacement.
3. Server values override browser values for all dynamic performance tags.
4. Therefore `Te`, Cooling Capacity, COP and Power Consumption no longer depend
   on browser cache or an older `TemplateMappingService.js`.

## Cooling Capacity tag compatibility

The current `DatasheetTemplate.docx` contains tags such as:

```text
CAP1-1
CAP1-2
...
```

The latest specification example uses:

```text
CC1-1
CC1-2
...
```

Version 7.6.6 treats both forms as equivalent:

```text
CC1-1 <=> CAP1-1
```

The exact CSV tag is always used, and the compatible alias is added for Cooling
Capacity only.

## Diagnostics

PDF generation now reports:

```text
performanceCurveMatchedRows
performanceCurveReplacementTags
performanceCurveMatchedTagGroups
performanceCurveTotalTagGroups
performanceCurveTagMatches
```

A warning is generated only when none of the candidate tags for a performance
value exists in the template.

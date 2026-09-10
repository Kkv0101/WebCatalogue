/**
 * Product database access and performance calculation.
 *
 * Version 7.6.6 implements specification sections 9, 9.1 and 9.2:
 * - corrected A..J polynomial
 * - calculated homepage Rated Points for EN13215_RG20 and EN13215_SH10
 * - Rated Point values exposed to parameter_mapping.json for the datasheet
 * - detailed datasheet performance values calculated from Performance_Curve.csv
 */
function listProductSummaries_() {
  const snapshot = getDatabaseSnapshot_();

  return snapshot.products.map(function (row) {
    const ratedPointsByStandard = {};
    CATALOGUE_CONFIG.HOMEPAGE_PERFORMANCE_STANDARDS.forEach(function (standard) {
      ratedPointsByStandard[standard] = calculateRatedPointPerformance_(
        row, snapshot.curveCoefficients || [], standard
      );
    });
    const ratedPoint = ratedPointsByStandard[CATALOGUE_CONFIG.HOMEPAGE_PERFORMANCE_STANDARD];

    return {
      engineeringCode: text_(row.MATNR),
      model: text_(row.ZZMODEL),
      refrigerant:
        text_(row.CU_GENERAL_REFRIGERANT),
      frequency:
        text_(row.CU_GENERAL_FREQUENCY_1),
      application:
        text_(row.APPLICATION),
      motorType:
        text_(row.CU_ELETR_MOTORTYPE),
      powerSupply:
        formatPowerSupply_(row),
      status:
        text_(row.CODE_STATUS),
      standard:
        ratedPoint.standard,
      drawing3d:
        text_(row.DRAWING_3d),

      // Kept as "performance" for compatibility with app.js.
      performance: ratedPoint,

      ratedPoint: ratedPoint,
      ratedPointsByStandard: ratedPointsByStandard
    };
  }).filter(function (item) {
    return (
      item.engineeringCode &&
      item.model
    );
  });
}

/**
 * Looks up a product drawing without calculating datasheet performance.
 * The reference remains confined to the configured 3D graphics folder.
 *
 * @param {string} engineeringCode
 * @return {string}
 */
function getProductThumbnailReference_(engineeringCode) {
  const normalizedCode =
    String(engineeringCode || '').trim().toLowerCase();

  const productRow = getDatabaseSnapshot_().products.find(
    function (row) {
      return text_(row.MATNR).toLowerCase() === normalizedCode;
    }
  );

  if (!productRow) {
    throw new Error('Product not found: ' + engineeringCode);
  }

  return text_(productRow.DRAWING_3d);
}

/**
 * Returns product data for browser-side TemplateMappingService.js.
 *
 * context.ratedPoints contains the calculated Rated Point required by the
 * latest parameter_mapping.json.
 *
 * @param {string} engineeringCode
 * @return {Object}
 */
function getProductTemplateContext_(
  engineeringCode,
  requestedStandard
) {
  const snapshot =
    getDatabaseSnapshot_();

  const normalizedCode =
    String(engineeringCode)
      .trim()
      .toLowerCase();

  const productRow =
    snapshot.products.find(
      function (row) {
        return (
          text_(row.MATNR)
            .toLowerCase() ===
          normalizedCode
        );
      }
    );

  if (!productRow) {
    throw new Error(
      'Product not found: ' +
      engineeringCode
    );
  }

  const rawRatedPoints =
    (snapshot.ratedPoints || [])
      .filter(function (row) {
        return (
          text_(row.MATNR)
            .toLowerCase() ===
          normalizedCode
        );
      });

  const performanceRows =
    (snapshot.performance || [])
      .filter(function (row) {
        return (
          text_(row.MATNR)
            .toLowerCase() ===
          normalizedCode
        );
      });

  const ratedPoint =
    calculateRatedPointPerformance_(
      productRow,
      snapshot.curveCoefficients || [],
      requestedStandard
    );

  const calculatedRatedPointRow =
    buildRatedPointTemplateRow_(
      ratedPoint
    );

  const performanceCurveDefinition =
    loadPerformanceCurveDefinition_();

  const calculatedPerformanceCurve =
    buildDatasheetPerformanceCurveFromRows_(
      productRow,
      snapshot.curveCoefficients || [],
      performanceCurveDefinition.rows,
      performanceCurveDefinition.allTags,
      ratedPoint.standard
    );

  return {
    productRow: productRow,

    // Latest parameter_mapping.json reads Rated* values from ratedPoints[0].
    ratedPoints:
      calculatedRatedPointRow
        ? [calculatedRatedPointRow]
        : [],

    // Kept for diagnostics/backward reference only.
    rawRatedPoints:
      rawRatedPoints,

    performanceRows:
      sortPerformanceRows_(
        performanceRows
      ),

    homepagePerformance:
      ratedPoint,

    ratedPoint:
      ratedPoint,

    // Section 9.2: dynamic tag/value map from Performance_Curve.csv.
    performanceCurveSource:
      CATALOGUE_CONFIG.WEB_FILES.performanceCurveCsv,

    performanceCurveReplacements:
      calculatedPerformanceCurve.replacements,

    performanceCurveRows:
      calculatedPerformanceCurve.rows,

    performanceCurveTagGroups:
      calculatedPerformanceCurve.tagGroups,

    performanceCurveDiagnostics:
      {
        totalDefinitionRows:
          performanceCurveDefinition.rows.length,
        matchedDefinitionRows:
          calculatedPerformanceCurve.rows.length,
        replacementTagCount:
          Object.keys(
            calculatedPerformanceCurve.replacements ||
            {}
          ).length,
        standard:
          calculatedPerformanceCurve.standard,
        status:
          calculatedPerformanceCurve.status,
        warnings:
          calculatedPerformanceCurve.warnings
      },

    database:
      snapshot.database
  };
}

/**
 * Calculates the Rated Point according to specification section 9.1.
 *
 * Calculation standards:
 *   EN13215_RG20 (default) or EN13215_SH10
 *
 * Datasheet display standard:
 *   EN13215 RG20
 *
 * Rated conditions by Application:
 * - M/HBP => Te=-10 °C, Ta=32 °C
 * - HBP   => Te=-10 °C, Ta=32 °C
 * - MBP   => Te=-10 °C, Ta=32 °C
 * - LBP   => Te=-35 °C, Ta=32 °C
 *
 * Coefficient row:
 * - CDU Products Data.PD_Config = Curve Coefficients.PD_Config
 * - product refrigerant = Curve Coefficients.Refrigerant
 * - Curve Coefficients.Standard = the requested calculation standard
 *
 * @param {Object} productRow
 * @param {Array<Object>} curveRows
 * @param {string=} requestedStandard Defaults to the configured RG20 standard.
 * @return {Object}
 */
function calculateRatedPointPerformance_(productRow, curveRows, requestedStandard) {
  const calculationStandard = resolveRatedPointStandard_(requestedStandard);
  const displayStandard = calculationStandard.replace(/_/g, ' ');

  const application =
    normalizeApplication_(
      productRow.APPLICATION
    );

  const condition =
    CATALOGUE_CONFIG
      .HOMEPAGE_PERFORMANCE_POINTS[
        application
      ];

  const result = {
    standard:
      calculationStandard,

    displayStandard:
      displayStandard,

    application:
      application,

    evaporatingTemperatureC:
      condition ? condition.Te : null,

    ambientTemperatureC:
      condition ? condition.Ta : null,

    coolingCapacityW:
      null,

    powerConsumptionW:
      null,

    currentConsumptionA:
      null,

    copWW:
      null,

    coefficientRowFound:
      false,

    available:
      false,

    status:
      ''
  };

  if (!condition) {
    result.status =
      'unsupported-application';

    return result;
  }

  const point =
    calculatePerformanceAtPoint_(
      productRow,
      curveRows,
      calculationStandard,
      condition.Te,
      condition.Ta
    );

  result.coolingCapacityW =
    point.coolingCapacityW;

  result.powerConsumptionW =
    point.powerConsumptionW;

  result.currentConsumptionA =
    point.currentConsumptionA;

  result.copWW =
    point.copWW;

  result.coefficientRowFound =
    point.coefficientRowFound;

  result.available =
    point.available;

  result.status =
    point.status;

  return result;
}

/** Normalize and validate the standard shared by catalogue and datasheet calculations. */
function resolveRatedPointStandard_(requestedStandard) {
  const calculationStandard = CATALOGUE_CONFIG.HOMEPAGE_PERFORMANCE_STANDARDS.find(function (standard) {
    return normalizeStandard_(standard) === normalizeStandard_(requestedStandard || CATALOGUE_CONFIG.HOMEPAGE_PERFORMANCE_STANDARD);
  });
  if (!calculationStandard) throw new Error('Unsupported Rated Point standard: ' + requestedStandard);
  return calculationStandard;
}

/**
 * Calculates performance at any Ta / Te point using one Curve Coefficients row.
 *
 * Standard matching treats spaces, hyphens and underscores as equivalent.
 *
 * @param {Object} productRow
 * @param {Array<Object>} curveRows
 * @param {string} standard
 * @param {number} Te
 * @param {number} Ta
 * @return {Object}
 */
function calculatePerformanceAtPoint_(
  productRow,
  curveRows,
  standard,
  Te,
  Ta
) {
  const result = {
    standard: text_(standard),
    evaporatingTemperatureC: Te,
    ambientTemperatureC: Ta,

    coolingCapacityW: null,
    powerConsumptionW: null,
    currentConsumptionA: null,
    copWW: null,

    coefficientRowFound: false,
    available: false,
    status: ''
  };

  const pdConfig =
    normalizedKey_(
      productRow.PD_Config
    );

  if (!Number.isFinite(Te) || !Number.isFinite(Ta)) {
    result.status = 'missing-or-invalid-temperature';
    return result;
  }

  if (!pdConfig) {
    result.status =
      'missing-pd-config';

    return result;
  }

  const productRefrigerant =
    normalizeRefrigerant_(
      productRow
        .CU_GENERAL_REFRIGERANT
    );

  const coefficientRow =
    (curveRows || []).find(
      function (row) {
        return (
          normalizedKey_(
            row.PD_Config
          ) ===
            pdConfig &&

          normalizeRefrigerant_(
            row.Refrigerant
          ) ===
            productRefrigerant &&

          normalizeStandard_(
            row.Standard
          ) ===
            normalizeStandard_(
              standard
            )
        );
      }
    );

  if (!coefficientRow) {
    result.status =
      'coefficient-row-not-found';

    return result;
  }

  result.coefficientRowFound = true;

  const coolingCapacity =
    evaluatePerformancePolynomial_(
      coefficientRow,
      'CC_',
      Te,
      Ta
    );

  const powerConsumption =
    evaluatePerformancePolynomial_(
      coefficientRow,
      'CON_',
      Te,
      Ta
    );

  const currentConsumption =
    evaluatePerformancePolynomial_(
      coefficientRow,
      'CURR_',
      Te,
      Ta
    );

  const cop =
    Number.isFinite(coolingCapacity) &&
    Number.isFinite(powerConsumption) &&
    powerConsumption !== 0
      ? coolingCapacity /
        powerConsumption
      : null;

  result.coolingCapacityW =
    roundNumber_(
      coolingCapacity,
      6
    );

  result.powerConsumptionW =
    roundNumber_(
      powerConsumption,
      6
    );

  result.currentConsumptionA =
    currentConsumption === null
      ? null
      : roundNumber_(
          currentConsumption,
          6
        );

  result.copWW =
    cop === null
      ? null
      : roundNumber_(
          cop,
          6
        );

  result.available =
    Number.isFinite(
      result.coolingCapacityW
    ) &&
    Number.isFinite(
      result.powerConsumptionW
    ) &&
    Number.isFinite(
      result.copWW
    );

  result.status =
    result.available
      ? 'ok'
      : coolingCapacity === null || powerConsumption === null
        ? 'invalid-coefficients'
        : 'invalid-result';

  return result;
}

/**
 * Reads and validates Performance_Curve.csv from WEB_FOLDER_ID.
 *
 * Required columns:
 * id,refrigerant,standard,Application,Ta_val,Te_val,Te,CC,COP,CON
 *
 * @return {Object}
 */
function loadPerformanceCurveDefinition_() {
  const resources =
    getRequiredWebResources_();

  const csvText =
    readDriveTextFileById_(
      resources.performanceCurveCsv.id
    );

  if (
    csvText.length >
    CATALOGUE_CONFIG
      .MAX_PERFORMANCE_CURVE_CSV_CHARACTERS
  ) {
    throw new Error(
      'Performance_Curve.csv is too large: ' +
      csvText.length +
      ' characters.'
    );
  }

  return parsePerformanceCurveCsv_(
    csvText
  );
}

/**
 * Parses Performance_Curve.csv with Apps Script Utilities.parseCsv.
 *
 * Header matching is case-insensitive, while template tag values are preserved
 * exactly as written in the CSV.
 *
 * @param {string} csvText
 * @return {Object}
 */
function parsePerformanceCurveCsv_(
  csvText
) {
  let cleaned =
    String(csvText || '')
      .replace(/^\uFEFF/, '');

  if (!cleaned.trim()) {
    throw new Error(
      'Performance_Curve.csv is empty.'
    );
  }

  const requiredHeaders = [
    'id',
    'refrigerant',
    'standard',
    'application',
    'ta_val',
    'te_val',
    'te',
    'cc',
    'cop',
    'con'
  ];

  // Excel in regional settings can add an optional first line such as:
  // sep=;
  // Respect it when present.
  let explicitDelimiter = '';
  let sourceLineOffset = 0;

  const firstLineBreak =
    cleaned.search(/\r?\n/);

  const firstLine =
    (
      firstLineBreak === -1
        ? cleaned
        : cleaned.substring(
            0,
            firstLineBreak
          )
    ).trim();

  const separatorMatch =
    firstLine.match(
      /^sep\s*=\s*(.)$/i
    );

  if (separatorMatch) {
    explicitDelimiter =
      separatorMatch[1];

    sourceLineOffset = 1;

    cleaned =
      firstLineBreak === -1
        ? ''
        : cleaned.substring(
            firstLineBreak
          ).replace(
            /^\r?\n/,
            ''
          );
  }

  // v7.6.4 always used Utilities.parseCsv(text), which assumes comma.
  // v7.6.5 automatically supports common CSV/TSV delimiters.
  const delimiters =
    explicitDelimiter
      ? [explicitDelimiter]
      : [',', ';', '\t', '|'];

  let bestCandidate = null;

  delimiters.forEach(
    function (delimiter) {
      let matrix;

      try {
        matrix =
          Utilities.parseCsv(
            cleaned,
            delimiter
          );
      } catch (error) {
        return;
      }

      if (!matrix.length) {
        return;
      }

      const normalizedHeaders =
        normalizePerformanceCurveHeaders_(
          matrix[0]
        );

      const matchedHeaderCount =
        requiredHeaders.filter(
          function (header) {
            return (
              normalizedHeaders
                .indexOf(header) !== -1
            );
          }
        ).length;

      if (
        !bestCandidate ||
        matchedHeaderCount >
          bestCandidate.matchedHeaderCount
      ) {
        bestCandidate = {
          delimiter:
            delimiter,

          matrix:
            matrix,

          normalizedHeaders:
            normalizedHeaders,

          matchedHeaderCount:
            matchedHeaderCount
        };
      }
    }
  );

  if (!bestCandidate) {
    throw new Error(
      'Performance_Curve.csv could not be parsed.'
    );
  }

  const matrix =
    bestCandidate.matrix;

  const normalizedHeaders =
    bestCandidate.normalizedHeaders;

  const missingHeaders =
    requiredHeaders.filter(
      function (header) {
        return (
          normalizedHeaders
            .indexOf(header) === -1
        );
      }
    );

  if (missingHeaders.length) {
    throw new Error(
      'Performance_Curve.csv is missing columns: ' +
      missingHeaders.join(', ') +
      '. Detected delimiter: ' +
      describeCsvDelimiter_(
        bestCandidate.delimiter
      ) +
      '. Parsed header: [' +
      normalizedHeaders.join(', ') +
      '].'
    );
  }

  const headerIndex = {};

  normalizedHeaders.forEach(
    function (header, index) {
      if (header) {
        headerIndex[header] = index;
      }
    }
  );

  const rows = [];
  const allTags = {};

  matrix.slice(1).forEach(
    function (rawRow, rowOffset) {
      const isEmpty =
        rawRow.every(
          function (cell) {
            return (
              String(cell || '').trim() === ''
            );
          }
        );

      if (isEmpty) {
        return;
      }

      const rowNumber =
        rowOffset +
        2 +
        sourceLineOffset;

      const row = {
        id:
          csvCell_(
            rawRow,
            headerIndex.id
          ),

        refrigerant:
          csvCell_(
            rawRow,
            headerIndex.refrigerant
          ),

        standard:
          csvCell_(
            rawRow,
            headerIndex.standard
          ),

        application:
          csvCell_(
            rawRow,
            headerIndex.application
          ),

        Ta:
          csvNumber_(
            rawRow,
            headerIndex.ta_val,
            'Ta_val',
            rowNumber
          ),

        Te:
          csvNumber_(
            rawRow,
            headerIndex.te_val,
            'Te_val',
            rowNumber
          ),

        tags: {
          Te:
            csvTag_(
              rawRow,
              headerIndex.te,
              'Te',
              rowNumber
            ),

          CC:
            csvTag_(
              rawRow,
              headerIndex.cc,
              'CC',
              rowNumber
            ),

          COP:
            csvTag_(
              rawRow,
              headerIndex.cop,
              'COP',
              rowNumber
            ),

          CON:
            csvTag_(
              rawRow,
              headerIndex.con,
              'CON',
              rowNumber
            )
        },

        csvRowNumber:
          rowNumber
      };

      [
        row.tags.Te,
        row.tags.CC,
        row.tags.COP,
        row.tags.CON
      ].forEach(
        function (tag) {
          allTags[tag] = true;
        }
      );

      rows.push(row);
    }
  );

  return {
    rows:
      rows,

    allTags:
      Object.keys(allTags),

    delimiter:
      bestCandidate.delimiter,

    delimiterName:
      describeCsvDelimiter_(
        bestCandidate.delimiter
      ),

    headers:
      normalizedHeaders
  };
}

function normalizePerformanceCurveHeaders_(
  headers
) {
  return (headers || []).map(
    function (header) {
      return String(header || '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase();
    }
  );
}

function describeCsvDelimiter_(
  delimiter
) {
  if (delimiter === ',') {
    return 'comma (,)';
  }

  if (delimiter === ';') {
    return 'semicolon (;)';
  }

  if (delimiter === '\t') {
    return 'tab';
  }

  if (delimiter === '|') {
    return 'pipe (|)';
  }

  return String(delimiter || '');
}

function csvCell_(
  row,
  index
) {
  return index === undefined
    ? ''
    : String(
        row[index] === undefined
          ? ''
          : row[index]
      ).trim();
}

function csvNumber_(
  row,
  index,
  columnName,
  rowNumber
) {
  const value =
    csvCell_(
      row,
      index
    );

  const parsed =
    Number(
      value.replace(/,/g, '.')
    );

  // A missing temperature must not be interpreted as zero.
  return value && Number.isFinite(parsed)
    ? parsed
    : null;
}

function csvTag_(
  row,
  index,
  columnName,
  rowNumber
) {
  const tag =
    csvCell_(
      row,
      index
    );

  if (!tag) {
    throw new Error(
      'Performance_Curve.csv row ' +
      rowNumber +
      ' has an empty ' +
      columnName +
      ' template tag.'
    );
  }

  if (
    /^img_/i.test(tag) ||
    tag === '__proto__' ||
    tag === 'prototype' ||
    tag === 'constructor'
  ) {
    throw new Error(
      'Performance_Curve.csv row ' +
      rowNumber +
      ' contains unsupported template tag: ' +
      tag
    );
  }

  if (
    tag.length >
    CATALOGUE_CONFIG
      .MAX_REPLACEMENT_KEY_LENGTH
  ) {
    throw new Error(
      'Performance_Curve.csv template tag is too long: ' +
      tag
    );
  }

  return tag;
}

/**
 * Filters Performance_Curve.csv for one product and calculates every selected
 * Ta / Te point.
 *
 * Uses the requested standard for both CSV points and coefficient selection.
 *
 * @param {Object} productRow
 * @param {Array<Object>} curveRows
 * @param {Array<Object>} definitionRows
 * @param {Array<string>} allTags
 * @return {Object}
 */
function buildDatasheetPerformanceCurveFromRows_(
  productRow,
  curveRows,
  definitionRows,
  allTags,
  requestedStandard
) {
  const standard = resolveRatedPointStandard_(requestedStandard);

  const refrigerant =
    normalizeRefrigerant_(
      productRow
        .CU_GENERAL_REFRIGERANT
    );

  const application =
    normalizeApplication_(
      productRow.APPLICATION
    );

  const selected =
    (definitionRows || [])
      .filter(
        function (row) {
          return (
            row.refrigerant &&
            row.standard &&
            row.application &&
            normalizeRefrigerant_(
              row.refrigerant
            ) ===
              refrigerant &&

            normalizeStandard_(
              row.standard
            ) ===
              normalizeStandard_(
                standard
              ) &&

            normalizeApplication_(
              row.application
            ) ===
              application
          );
        }
      );

  const replacements = {};
  const calculatedRows = [];
  const usedTags = {};
  const tagGroups = [];
  const warnings = [];

  // Clear every defined performance cell, including cells with no matching
  // row for this product. Selected rows overwrite these defaults below.
  (allTags || []).forEach(function (tag) {
    performanceCurveTagCandidates_('CC', tag).forEach(
      function (candidate) {
        replacements[candidate] = '--';
      }
    );
  });

  if (!selected.length) {
    warnings.push(
      'No matching Performance_Curve.csv rows. ' +
      'Missing performance values were replaced with --.'
    );
  }

  selected.forEach(
    function (definition) {
      const point =
        calculatePerformanceAtPoint_(
          productRow,
          curveRows,
          definition.standard,
          definition.Te,
          definition.Ta
        );

      if (!point.available) {
        warnings.push(
          'Performance calculation unavailable for ' +
          'Performance_Curve.csv row ' +
          definition.csvRowNumber +
          ' (Ta=' +
          definition.Ta +
          ', Te=' +
          definition.Te +
          '): ' +
          point.status +
          '. Missing performance values were replaced with --.'
        );
      }

      const teValue =
        formatCalculationNumber_(
          definition.Te,
          2
        );

      const capacityValue =
        formatCalculationNumber_(
          point.coolingCapacityW,
          0
        );

      const copValue =
        formatCalculationNumber_(
          point.copWW,
          2
        );

      const consumptionValue =
        formatCalculationNumber_(
          point.powerConsumptionW,
          0
        );

      addPerformanceCurveTagGroup_(
        replacements,
        usedTags,
        tagGroups,
        'Te',
        definition.tags.Te,
        teValue
      );

      addPerformanceCurveTagGroup_(
        replacements,
        usedTags,
        tagGroups,
        'CC',
        definition.tags.CC,
        capacityValue
      );

      addPerformanceCurveTagGroup_(
        replacements,
        usedTags,
        tagGroups,
        'COP',
        definition.tags.COP,
        copValue
      );

      addPerformanceCurveTagGroup_(
        replacements,
        usedTags,
        tagGroups,
        'CON',
        definition.tags.CON,
        consumptionValue
      );

      calculatedRows.push({
        id:
          definition.id,

        refrigerant:
          definition.refrigerant,

        standard:
          definition.standard,

        application:
          definition.application,

        ambientTemperatureC:
          definition.Ta,

        evaporatingTemperatureC:
          definition.Te,

        coolingCapacityW:
          point.coolingCapacityW,

        powerConsumptionW:
          point.powerConsumptionW,

        copWW:
          point.copWW,

        status:
          point.status,

        tags:
          definition.tags
      });
    }
  );

  return {
    standard:
      standard,

    definitionTagCount:
      (allTags || []).length,

    replacements:
      replacements,

    tagGroups:
      tagGroups,

    rows:
      calculatedRows,

    warnings:
      warnings,

    status:
      selected.length
        ? warnings.length ? 'incomplete-performance-data' : 'ok'
        : 'no-matching-performance-curve-rows'
  };
}

/**
 * Adds one dynamic performance value and its allowed template aliases.
 *
 * The current DOCX template uses CAPx-y for Cooling Capacity, while the
 * latest specification example uses CCx-y. Both forms are supported:
 *
 *   CC1-1  <=>  CAP1-1
 *
 * Other tag types use the exact tag from Performance_Curve.csv.
 *
 * @param {Object} replacements
 * @param {Object} usedTags
 * @param {Array<Object>} tagGroups
 * @param {string} type
 * @param {string} sourceTag
 * @param {string} value
 */
function addPerformanceCurveTagGroup_(
  replacements,
  usedTags,
  tagGroups,
  type,
  sourceTag,
  value
) {
  const candidates =
    performanceCurveTagCandidates_(
      type,
      sourceTag
    );

  if (!candidates.length) {
    throw new Error(
      'Performance_Curve.csv contains an empty ' +
      type +
      ' template tag.'
    );
  }

  candidates.forEach(
    function (tag) {
      if (usedTags[tag]) {
        throw new Error(
          'Performance_Curve.csv contains duplicate template tag ' +
          tag +
          ' for the selected product.'
        );
      }

      usedTags[tag] = true;
      replacements[tag] = value;
    }
  );

  tagGroups.push({
    type:
      type,

    sourceTag:
      String(sourceTag || '').trim(),

    candidateTags:
      candidates,

    value:
      value
  });
}

/**
 * Returns the exact CSV tag plus known compatible tag aliases.
 *
 * @param {string} type
 * @param {string} sourceTag
 * @return {Array<string>}
 */
function performanceCurveTagCandidates_(
  type,
  sourceTag
) {
  const tag =
    String(sourceTag || '').trim();

  if (!tag) {
    return [];
  }

  const candidates = [tag];

  if (
    String(type || '').toUpperCase() ===
    'CC'
  ) {
    let match =
      tag.match(
        /^CC(\d+-\d+)$/i
      );

    if (match) {
      candidates.push(
        'CAP' + match[1]
      );
    } else {
      match =
        tag.match(
          /^CAP(\d+-\d+)$/i
        );

      if (match) {
        candidates.push(
          'CC' + match[1]
        );
      }
    }
  }

  const unique = {};

  return candidates.filter(
    function (candidate) {
      if (unique[candidate]) {
        return false;
      }

      unique[candidate] = true;
      return true;
    }
  );
}

/**
 * Returns Performance_Curve.csv diagnostics without requiring a product code.
 *
 * @return {Object}
 */
function performanceCurveFileTest_() {
  const definition =
    loadPerformanceCurveDefinition_();

  return {
    fileName:
      CATALOGUE_CONFIG
        .WEB_FILES
        .performanceCurveCsv,

    delimiter:
      definition.delimiterName ||
      definition.delimiter ||
      '',

    headers:
      definition.headers || [],

    rowCount:
      definition.rows.length,

    tagCount:
      definition.allTags.length,

    firstRows:
      definition.rows.slice(0, 5)
  };
}

/**
 * Product-specific Performance_Curve.csv diagnostic.
 *
 * @param {string} engineeringCode
 * @return {Object}
 */
function performanceCurveCalculationTest_(
  engineeringCode
) {
  const snapshot =
    getDatabaseSnapshot_();

  const code =
    String(engineeringCode || '')
      .trim()
      .toLowerCase();

  if (!code) {
    throw new Error(
      'engineeringCode is required.'
    );
  }

  const product =
    snapshot.products.find(
      function (row) {
        return (
          text_(row.MATNR)
            .toLowerCase() ===
          code
        );
      }
    );

  if (!product) {
    throw new Error(
      'Product not found: ' +
      engineeringCode
    );
  }

  const definition =
    loadPerformanceCurveDefinition_();

  const result =
    buildDatasheetPerformanceCurveFromRows_(
      product,
      snapshot.curveCoefficients || [],
      definition.rows,
      definition.allTags
    );

  return {
    engineeringCode:
      text_(product.MATNR),

    model:
      text_(product.ZZMODEL),

    pdConfig:
      text_(product.PD_Config),

    refrigerant:
      text_(
        product.CU_GENERAL_REFRIGERANT
      ),

    application:
      text_(product.APPLICATION),

    standard:
      result.standard,

    totalDefinitionRows:
      definition.rows.length,

    matchingRows:
      result.rows.length,

    status:
      result.status,

    calculatedRows:
      result.rows,

    replacements:
      result.replacements,

    tagGroups:
      result.tagGroups
  };
}

/**
 * Backward-compatible alias used by previous diagnostics.
 */
function calculateHomepagePerformance_(
  productRow,
  curveRows
) {
  return calculateRatedPointPerformance_(
    productRow,
    curveRows
  );
}

/**
 * Creates the calculated row consumed by parameter_mapping.json:
 *
 * Standard
 * RatedAmbientTemperature_C
 * RatedEvaporatingTemperature_C
 * RatedCapacity_W
 * RatedEfficiency_WW
 * RatedPowerConsumption_W
 *
 * @param {Object} ratedPoint
 * @return {Object}
 */
function buildRatedPointTemplateRow_(
  ratedPoint
) {
  ratedPoint = ratedPoint || {};

  return {
    Standard:
      ratedPoint.displayStandard || '--',

    RatedAmbientTemperature_C:
      formatCalculationNumber_(
        ratedPoint
          .ambientTemperatureC,
        2
      ),

    RatedEvaporatingTemperature_C:
      formatCalculationNumber_(
        ratedPoint
          .evaporatingTemperatureC,
        2
      ),

    RatedCapacity_W:
      formatCalculationNumber_(
        ratedPoint.coolingCapacityW,
        0
      ),

    RatedEfficiency_WW:
      formatCalculationNumber_(
        ratedPoint.copWW,
        2
      ),

    RatedPowerConsumption_W:
      formatCalculationNumber_(
        ratedPoint.powerConsumptionW,
        0
      ),

    RatedCurrentConsumption_A:
      formatCalculationNumber_(
        ratedPoint.currentConsumptionA,
        2
      )
  };
}

/**
 * New polynomial from specification section 9:
 *
 * Parameter =
 *   A
 * + Te * B
 * + Ta * C
 * + Te * Ta * D
 * + Te² * E
 * + Ta² * F
 * + Te² * Ta * G
 * + Te * Ta² * H
 * + Te³ * I
 * + Ta³ * J
 *
 * @return {number|null}
 */
function evaluatePerformancePolynomial_(
  row,
  prefix,
  Te,
  Ta
) {
  const coefficients = {};

  [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J'
  ].forEach(function (letter) {
    coefficients[letter] =
      coefficientNumber_(
        row[prefix + letter]
      );
  });

  const missing =
    Object.keys(coefficients)
      .some(function (letter) {
        return (
          coefficients[letter] === null
        );
      });

  if (missing) {
    return null;
  }

  const Te2 = Te * Te;
  const Ta2 = Ta * Ta;
  const Te3 = Te2 * Te;
  const Ta3 = Ta2 * Ta;

  return (
    coefficients.A +
    Te * coefficients.B +
    Ta * coefficients.C +
    Te * Ta * coefficients.D +
    Te2 * coefficients.E +
    Ta2 * coefficients.F +
    Te2 * Ta * coefficients.G +
    Te * Ta2 * coefficients.H +
    Te3 * coefficients.I +
    Ta3 * coefficients.J
  );
}

function coefficientNumber_(
  value
) {
  const normalized =
    text_(value);

  if (!normalized) {
    return null;
  }

  const parsed =
    Number(
      normalized.replace(/,/g, '.')
    );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function normalizeApplication_(
  value
) {
  return text_(value)
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normalizeRefrigerant_(
  value
) {
  return text_(value)
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
}

/**
 * Standard matching treats spaces, hyphens and underscores as equivalent.
 */
function normalizeStandard_(
  value
) {
  return text_(value)
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
}

function normalizedKey_(
  value
) {
  return text_(value)
    .toUpperCase()
    .replace(/\s+/g, '');
}

function roundNumber_(
  value,
  decimals
) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor =
    Math.pow(
      10,
      decimals || 0
    );

  return Math.round(
    value * factor
  ) / factor;
}

/**
 * Formats calculated values for template replacement.
 * Integers contain no decimal places.
 * Missing or invalid performance values use --.
 */
function formatCalculationNumber_(
  value,
  decimals
) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  if (!decimals) {
    return String(
      Math.round(value)
    );
  }

  return Number(value)
    .toFixed(decimals)
    .replace(/\.?0+$/, '');
}

function sortPerformanceRows_(
  rows
) {
  return (rows || [])
    .slice()
    .sort(function (a, b) {
      const ambientA =
        number_(
          a.AmbientTemperature_C
        );

      const ambientB =
        number_(
          b.AmbientTemperature_C
        );

      if (ambientA !== ambientB) {
        return compareNullableNumbers_(
          ambientA,
          ambientB
        );
      }

      const sortA =
        number_(a.SortOrder);

      const sortB =
        number_(b.SortOrder);

      if (
        sortA !== null ||
        sortB !== null
      ) {
        return compareNullableNumbers_(
          sortA,
          sortB
        );
      }

      return compareNullableNumbers_(
        number_(
          a.EvaporatingTemperature_C
        ),
        number_(
          b.EvaporatingTemperature_C
        )
      );
    });
}

function compareNullableNumbers_(
  a,
  b
) {
  if (
    a === null &&
    b === null
  ) {
    return 0;
  }

  if (a === null) return 1;
  if (b === null) return -1;

  return a - b;
}

function formatPowerSupply_(
  row
) {
  const supply =
    text_(
      row.CU_GENERAL_ENERGY_SUPPLY_1
    );

  const frequency =
    text_(
      row.CU_GENERAL_FREQUENCY_1
    );

  return [
    supply
      ? supply + ' V'
      : '',
    frequency
      ? frequency + ' Hz'
      : ''
  ].filter(Boolean).join(' ');
}

function text_(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  const result =
    String(value).trim();

  if (!result) {
    return '';
  }

  const normalized =
    result.toLowerCase();

  if (
    normalized === 'null' ||
    normalized === 'undefined' ||
    normalized === 'n/a'
  ) {
    return '';
  }

  return result;
}

function number_(
  value
) {
  const stringValue =
    text_(value);

  if (!stringValue) {
    return null;
  }

  const parsed =
    Number(
      stringValue.replace(/,/g, '.')
    );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

/**
 * Diagnostic test for the first product.
 *
 * @return {Object}
 */
function performanceCalculationTest_() {
  const snapshot =
    getDatabaseSnapshot_();

  if (!snapshot.products.length) {
    throw new Error(
      'No products available for performance calculation test.'
    );
  }

  const product =
    snapshot.products[0];

  const ratedPoint =
    calculateRatedPointPerformance_(
      product,
      snapshot.curveCoefficients || []
    );

  return {
    engineeringCode:
      text_(product.MATNR),

    model:
      text_(product.ZZMODEL),

    pdConfig:
      text_(product.PD_Config),

    refrigerant:
      text_(
        product.CU_GENERAL_REFRIGERANT
      ),

    application:
      text_(product.APPLICATION),

    calculationStandard:
      CATALOGUE_CONFIG
        .HOMEPAGE_PERFORMANCE_STANDARD,

    datasheetStandard:
      CATALOGUE_CONFIG
        .RATED_POINT_DISPLAY_STANDARD,

    result:
      ratedPoint,

    ratedPointTemplateRow:
      buildRatedPointTemplateRow_(
        ratedPoint
      ),

    coefficientRows:
      (snapshot.curveCoefficients || [])
        .length,

    standardTempRows:
      (snapshot.standardTemp || [])
        .length
  };
}

/**
 * Stable Apps Script entry points.
 *
 * Google Apps Script can expose only top-level project functions to
 * google.script.run. These thin wrappers delegate to CatalogueService.js
 * loaded from WEB_FOLDER_ID.
 */

function getCatalogueBootstrap() {
  return getServerModuleRuntime_()
    .catalogueService
    .getCatalogueBootstrap();
}

function getProductTemplateContext(engineeringCode) {
  return getServerModuleRuntime_()
    .catalogueService
    .getProductTemplateContext(engineeringCode);
}

function generateProductDatasheetPdf(
  engineeringCode,
  replacements
) {
  return getServerModuleRuntime_()
    .catalogueService
    .generateProductDatasheetPdf(
      engineeringCode,
      replacements
    );
}

function refreshCatalogueCache() {
  const result = getServerModuleRuntime_()
    .catalogueService
    .refreshCatalogueCache();

  resetServerModuleRuntime_();
  return result;
}

function testConfiguration() {
  const result = getServerModuleRuntime_()
    .catalogueService
    .testConfiguration();

  result.serverModules =
    getServerModuleDiagnostics_();

  return result;
}

function runTestConfiguration() {
  const result = testConfiguration();

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}

function runRefreshCatalogueCache() {
  const result = refreshCatalogueCache();

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}

function runTemplateGenerationTest() {
  const result = getServerModuleRuntime_()
    .catalogueService
    .runTemplateGenerationTest();

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}


/**
 * Converts the template temporarily and reports its inline-image descriptions.
 *
 * @return {Object}
 */
function runTemplateImageDescriptionTest() {
  const result = getServerModuleRuntime_()
    .catalogueService
    .runTemplateImageDescriptionTest();

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}


/**
 * Tests homepage performance calculation for the first product.
 *
 * @return {Object}
 */
function runPerformanceCalculationTest() {
  const result =
    performanceCalculationTest_();

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}


/**
 * Verifies that the Curve Coefficients worksheet is loaded.
 *
 * @return {Object}
 */
function runCurveCoefficientsTest() {
  const snapshot = getDatabaseSnapshot_();
  const rows = snapshot.curveCoefficients || [];
  const first = rows.length ? rows[0] : null;

  const result = {
    sheetName:
      CATALOGUE_CONFIG.CURVE_COEFFICIENTS_SHEET,
    loaded: rows.length > 0,
    rowCount: rows.length,
    firstRow: first
      ? {
          PD_Config: first.PD_Config || '',
          Refrigerant: first.Refrigerant || '',
          Standard: first.Standard || '',
          CC_J: first.CC_J || '',
          CC_I: first.CC_I || '',
          CC_H: first.CC_H || '',
          CON_J: first.CON_J || '',
          CURR_J: first.CURR_J || ''
        }
      : null
  };

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}


/**
 * Tests Rated Point calculation for a selected engineering code.
 *
 * @param {string} engineeringCode
 * @return {Object}
 */
function runRatedPointTest(engineeringCode) {
  const snapshot = getDatabaseSnapshot_();

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

  const relatedRows =
    (snapshot.curveCoefficients || [])
      .filter(function (row) {
        return (
          normalizedKey_(
            row.PD_Config
          ) ===
          normalizedKey_(
            product.PD_Config
          )
        );
      });

  const result =
    calculateRatedPointPerformance_(
      product,
      snapshot.curveCoefficients || []
    );

  const diagnostic = {
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

    relatedCoefficientRows:
      relatedRows.map(
        function (row) {
          return {
            PD_Config:
              row.PD_Config || '',
            Refrigerant:
              row.Refrigerant || '',
            Standard:
              row.Standard || ''
          };
        }
      ),

    ratedPoint:
      result,

    datasheetRatedPoint:
      buildRatedPointTemplateRow_(
        result
      )
  };

  console.log(
    JSON.stringify(
      diagnostic,
      null,
      2
    )
  );

  return diagnostic;
}


/**
 * Validates Performance_Curve.csv and reports parsed rows/tags.
 *
 * @return {Object}
 */
function runPerformanceCurveFileTest() {
  const result =
    performanceCurveFileTest_();

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}

/**
 * Calculates all detailed datasheet performance rows for one product.
 *
 * @param {string} engineeringCode
 * @return {Object}
 */
function runPerformanceCurveTest(
  engineeringCode
) {
  const result =
    performanceCurveCalculationTest_(
      engineeringCode
    );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}

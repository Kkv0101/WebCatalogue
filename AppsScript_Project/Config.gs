/**
 * Product Catalogue v7.6.6 configuration.
 *
 * The datasheet template contains four replaceable images identified by Image
 * Description. Database columns point to graphic filenames in Shared Drive.
 */
const CATALOGUE_CONFIG = Object.freeze({
  VERSION: '7.6.6',

  DATABASE_SHEET: 'CDU Products Data',
  RATED_POINTS_SHEET: 'Rated Points',
  PERFORMANCE_SHEET: 'Performance',
  ENVELOPE_POINTS_SHEET: 'Envelope Points',
  CURVE_COEFFICIENTS_SHEET: 'Curve Coefficients',
  STANDARD_TEMP_SHEET: 'StandardTemp',

  HOMEPAGE_PERFORMANCE_STANDARD: 'EN13215_RG20',
  HOMEPAGE_PERFORMANCE_STANDARDS: Object.freeze(['EN13215_RG20', 'EN13215_SH10']),
  RATED_POINT_DISPLAY_STANDARD: 'EN13215 RG20',
  HOMEPAGE_PERFORMANCE_POINTS: Object.freeze({
    'M/HBP': Object.freeze({ Te: -10, Ta: 32 }),
    'HBP': Object.freeze({ Te: -10, Ta: 32 }),
    'MBP': Object.freeze({ Te: -10, Ta: 32 }),
    'LBP': Object.freeze({ Te: -35, Ta: 32 })
  }),

  WEB_FILES: Object.freeze({
    index: 'index.html',
    styles: 'styles.css',
    templateMappingScript: 'TemplateMappingService.js',
    appScript: 'app.js',
    uiConfig: 'catalogue-config.json',
    datasheetTemplate: 'DatasheetTemplate.docx',
    parameterMapping: 'parameter_mapping.json',
    performanceCurveCsv: 'Performance_Curve.csv'
  }),

  SERVER_MODULE_FILES: Object.freeze({
    driveFileService: 'DriveFileService.js',
    workbookService: 'WorkbookService.js',
    docxPdfService: 'DocxPdfService.js',
    catalogueService: 'CatalogueService.js'
  }),

  FONT_FILES: Object.freeze({
    thin: 'EmbracoBeauSans-Thin.otf',
    regular: 'EmbracoBeauSans-Regular.otf',
    bold: 'EmbracoBeauSans-Bold.otf'
  }),

  GRAPHIC_FIELDS: Object.freeze({
    DRAWING_3d: Object.freeze({
      imageDescription: 'img_3D',
      runtimeFolderKey: 'graphic3dFolderId'
    }),
    EXTERNAL_DIMENSIONS: Object.freeze({
      imageDescription: 'img_Dimensions',
      runtimeFolderKey: 'graphicDimensionsFolderId'
    }),
    ELECTRICAL_DIAGRAM: Object.freeze({
      imageDescription: 'img_Wiring',
      runtimeFolderKey: 'graphicElectricalFolderId'
    }),
    ENVELOPE: Object.freeze({
      imageDescription: 'img_Envelope',
      runtimeFolderKey: 'graphicEnvelopeFolderId'
    })
  }),

  GRAPHIC_EXTENSIONS: Object.freeze([
    'png',
    'jpg',
    'jpeg'
  ]),

  IMAGE_FIT_MODE: 'contain',
  MISSING_IMAGE_ACTION: 'keep-template-image',

  CACHE_SECONDS: 600,
  CACHE_CHUNK_SIZE: 80000,
  MAX_PRODUCT_ID_LENGTH: 80,

  MAX_REPLACEMENT_ENTRIES: 500,
  MAX_REPLACEMENT_KEY_LENGTH: 200,
  MAX_REPLACEMENT_VALUE_LENGTH: 10000,
  MAX_REPLACEMENT_TOTAL_CHARACTERS: 300000,

  MAX_SERVER_MODULE_CHARACTERS: 300000,
  MAX_PERFORMANCE_CURVE_CSV_CHARACTERS: 500000,
  PERFORMANCE_CURVE_STANDARD: 'EN13215 RG20',

  // Base64 adds approximately 33% to the PDF byte size.
  MAX_PDF_BYTES: 12 * 1024 * 1024,

  GOOGLE_DOC_MIME_TYPE: 'application/vnd.google-apps.document',
  PDF_MIME_TYPE: 'application/pdf'
});

/**
 * Saves the core application locations.
 *
 * @param {string} dataFolderId Folder containing the product database.
 * @param {string} webFolderId Folder containing web files and server modules.
 * @param {string} databaseFileId Google Sheet or XLSX database file ID.
 * @return {Object}
 */
function setupConfiguration(dataFolderId, webFolderId, databaseFileId) {
  validateRequiredIds_([
    { name: 'dataFolderId', value: dataFolderId },
    { name: 'webFolderId', value: webFolderId },
    { name: 'databaseFileId', value: databaseFileId }
  ]);

  PropertiesService.getScriptProperties().setProperties({
    DATA_FOLDER_ID: dataFolderId.trim(),
    WEB_FOLDER_ID: webFolderId.trim(),
    DATABASE_FILE_ID: databaseFileId.trim()
  }, false);

  clearAllCatalogueCaches_();
  resetServerModuleRuntime_();

  return getConfigurationStatus();
}

/**
 * Saves the four optional dedicated graphic folders.
 *
 * When a dedicated folder is not configured, Version 7.6 searches
 * DATA_FOLDER_ID for that graphic category.
 *
 * @return {Object}
 */
function setupGraphicFolders(
  drawing3dFolderId,
  externalDimensionsFolderId,
  electricalDiagramFolderId,
  operatingEnvelopeFolderId
) {
  validateRequiredIds_([
    {
      name: 'drawing3dFolderId',
      value: drawing3dFolderId
    },
    {
      name: 'externalDimensionsFolderId',
      value: externalDimensionsFolderId
    },
    {
      name: 'electricalDiagramFolderId',
      value: electricalDiagramFolderId
    },
    {
      name: 'operatingEnvelopeFolderId',
      value: operatingEnvelopeFolderId
    }
  ]);

  PropertiesService.getScriptProperties().setProperties({
    GRAPHIC_3D_FOLDER_ID:
      drawing3dFolderId.trim(),
    GRAPHIC_DIMENSIONS_FOLDER_ID:
      externalDimensionsFolderId.trim(),
    GRAPHIC_ELECTRICAL_FOLDER_ID:
      electricalDiagramFolderId.trim(),
    GRAPHIC_ENVELOPE_FOLDER_ID:
      operatingEnvelopeFolderId.trim()
  }, false);

  clearAllCatalogueCaches_();
  resetServerModuleRuntime_();

  return getConfigurationStatus();
}

/**
 * Optional one-step setup for a new installation.
 *
 * @return {Object}
 */
function setupAllConfiguration(
  dataFolderId,
  webFolderId,
  databaseFileId,
  drawing3dFolderId,
  externalDimensionsFolderId,
  electricalDiagramFolderId,
  operatingEnvelopeFolderId
) {
  setupConfiguration(
    dataFolderId,
    webFolderId,
    databaseFileId
  );

  return setupGraphicFolders(
    drawing3dFolderId,
    externalDimensionsFolderId,
    electricalDiagramFolderId,
    operatingEnvelopeFolderId
  );
}

/**
 * Returns the currently stored non-secret configuration.
 *
 * @return {Object}
 */
function getConfigurationStatus() {
  const props =
    PropertiesService.getScriptProperties();

  const status = {
    dataFolderId:
      props.getProperty('DATA_FOLDER_ID') || '',
    webFolderId:
      props.getProperty('WEB_FOLDER_ID') || '',
    databaseFileId:
      props.getProperty('DATABASE_FILE_ID') || '',

    graphic3dFolderId:
      props.getProperty('GRAPHIC_3D_FOLDER_ID') || '',
    graphicDimensionsFolderId:
      props.getProperty(
        'GRAPHIC_DIMENSIONS_FOLDER_ID'
      ) || '',
    graphicElectricalFolderId:
      props.getProperty(
        'GRAPHIC_ELECTRICAL_FOLDER_ID'
      ) || '',
    graphicEnvelopeFolderId:
      props.getProperty(
        'GRAPHIC_ENVELOPE_FOLDER_ID'
      ) || '',

    legacyPreviewFolderId:
      props.getProperty('PREVIEW_FOLDER_ID') || ''
  };

  status.configured = Boolean(
    status.dataFolderId &&
    status.webFolderId &&
    status.databaseFileId
  );

  status.dedicatedGraphicFoldersConfigured =
    Boolean(
      status.graphic3dFolderId &&
      status.graphicDimensionsFolderId &&
      status.graphicElectricalFolderId &&
      status.graphicEnvelopeFolderId
    );

  status.graphicFolderFallback =
    status.dedicatedGraphicFoldersConfigured
      ? ''
      : 'DATA_FOLDER_ID';

  return status;
}

/** @return {Object} Validated runtime configuration. */
function getRuntimeConfiguration_() {
  const props =
    PropertiesService.getScriptProperties();

  const config = {
    dataFolderId:
      props.getProperty('DATA_FOLDER_ID'),
    webFolderId:
      props.getProperty('WEB_FOLDER_ID'),
    databaseFileId:
      props.getProperty('DATABASE_FILE_ID')
  };

  const missing = Object.keys(config).filter(
    function (key) {
      return !config[key];
    }
  );

  if (missing.length) {
    throw new Error(
      'Application configuration is incomplete. Missing: ' +
      missing.join(', ') + '.'
    );
  }

  config.graphic3dFolderId =
    props.getProperty('GRAPHIC_3D_FOLDER_ID') ||
    config.dataFolderId;

  config.graphicDimensionsFolderId =
    props.getProperty(
      'GRAPHIC_DIMENSIONS_FOLDER_ID'
    ) ||
    config.dataFolderId;

  config.graphicElectricalFolderId =
    props.getProperty(
      'GRAPHIC_ELECTRICAL_FOLDER_ID'
    ) ||
    config.dataFolderId;

  config.graphicEnvelopeFolderId =
    props.getProperty(
      'GRAPHIC_ENVELOPE_FOLDER_ID'
    ) ||
    config.dataFolderId;

  config.graphicFolderFallbackUsed = {
    DRAWING_3d:
      !props.getProperty('GRAPHIC_3D_FOLDER_ID'),
    EXTERNAL_DIMENSIONS:
      !props.getProperty(
        'GRAPHIC_DIMENSIONS_FOLDER_ID'
      ),
    ELECTRICAL_DIAGRAM:
      !props.getProperty(
        'GRAPHIC_ELECTRICAL_FOLDER_ID'
      ),
    ENVELOPE:
      !props.getProperty(
        'GRAPHIC_ENVELOPE_FOLDER_ID'
      )
  };

  return config;
}

function validateRequiredIds_(entries) {
  entries.forEach(function (entry) {
    if (
      !entry.value ||
      typeof entry.value !== 'string' ||
      !entry.value.trim()
    ) {
      throw new Error(
        'Required ID is missing: ' +
        entry.name
      );
    }
  });
}

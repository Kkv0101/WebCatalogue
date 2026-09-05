/**
 * Loads trusted server-side JavaScript modules from WEB_FOLDER_ID.
 *
 * These files are not executed in the browser:
 * - DriveFileService.js
 * - WorkbookService.js
 * - DocxPdfService.js
 * - CatalogueService.js
 *
 * Each Drive file exports a factory function. The factory receives an explicit
 * dependency object and returns a frozen service API.
 *
 * Security note:
 * Editors of WEB_FOLDER_ID can change code that executes with the web-app
 * deployer's permissions. Restrict edit access to trusted maintainers.
 */

var SERVER_MODULE_RUNTIME_CACHE_ = null;

/**
 * Returns the loaded server module runtime for the current Apps Script
 * execution.
 *
 * @return {Object}
 */
function getServerModuleRuntime_() {
  if (SERVER_MODULE_RUNTIME_CACHE_) {
    return SERVER_MODULE_RUNTIME_CACHE_;
  }

  const runtimeConfig = getRuntimeConfiguration_();
  const folderFiles = bootstrapListFolderFiles_(
    runtimeConfig.webFolderId
  );
  const folderIndex = bootstrapCreateFileIndex_(folderFiles);

  const moduleFiles = {};
  const moduleSources = {};
  const diagnostics = {};

  Object.keys(CATALOGUE_CONFIG.SERVER_MODULE_FILES).forEach(
    function (moduleKey) {
      const fileName =
        CATALOGUE_CONFIG.SERVER_MODULE_FILES[moduleKey];

      const file = bootstrapFindRequiredFile_(
        folderIndex,
        fileName
      );

      const source = bootstrapReadTextFile_(file.id);

      if (
        !source ||
        source.length >
          CATALOGUE_CONFIG.MAX_SERVER_MODULE_CHARACTERS
      ) {
        throw new Error(
          'Invalid server module size for ' +
          fileName +
          ': ' +
          source.length +
          ' characters.'
        );
      }

      moduleFiles[moduleKey] = file;
      moduleSources[moduleKey] = source;

      diagnostics[moduleKey] = {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType || '',
        modifiedTime: file.modifiedTime || '',
        size: file.size || '',
        sourceCharacters: source.length,
        sha256: bootstrapSha256Text_(source)
      };
    }
  );

  const driveFileService = createServerModule_(
    moduleSources.driveFileService,
    moduleFiles.driveFileService.name,
    {
      CATALOGUE_CONFIG: CATALOGUE_CONFIG,
      getRuntimeConfiguration_: getRuntimeConfiguration_,

      Drive: Drive,
      DriveApp: DriveApp,
      Utilities: Utilities,
      console: console
    },
    [
      'listFolderFiles_',
      'createFileIndex_',
      'findFileInIndex_',
      'findRequiredFileInIndex_',
      'readDriveTextFileById_',
      'readDriveJsonFileById_',
      'getWebFolderIndex_',
      'optionalFontFaceCss_',
      'getRequiredWebResources_',
      'resolveGraphicFile_',
      'getGraphicImageBlob_'
    ]
  );

  const workbookService = createServerModule_(
    moduleSources.workbookService,
    moduleFiles.workbookService.name,
    {
      CATALOGUE_CONFIG: CATALOGUE_CONFIG,
      getRuntimeConfiguration_: getRuntimeConfiguration_,
      cacheGetLarge_: cacheGetLarge_,
      cachePutLarge_: cachePutLarge_,

      LockService: LockService,
      Drive: Drive,
      DriveApp: DriveApp,
      SpreadsheetApp: SpreadsheetApp,
      console: console
    },
    [
      'getDatabaseSnapshot_'
    ]
  );

  const docxPdfService = createServerModule_(
    moduleSources.docxPdfService,
    moduleFiles.docxPdfService.name,
    {
      CATALOGUE_CONFIG: CATALOGUE_CONFIG,
      getRuntimeConfiguration_: getRuntimeConfiguration_,

      getRequiredWebResources_:
        driveFileService.getRequiredWebResources_,

      resolveGraphicFile_:
        driveFileService.resolveGraphicFile_,

      getGraphicImageBlob_:
        driveFileService.getGraphicImageBlob_,

      getProductTemplateContext_:
        getProductTemplateContext_,

      text_: text_,

      Drive: Drive,
      DriveApp: DriveApp,
      Docs: Docs,
      DocumentApp: DocumentApp,
      Utilities: Utilities,
      console: console
    },
    [
      'generateProductDatasheetPdf_',
      'validateReplacementMap_',
      'validateParameterMappingDocument_',
      'collectAllowedTemplateTags_',
      'collectImageMappings_',
      'inspectTemplateImageDescriptions_'
    ]
  );

  const catalogueService = createServerModule_(
    moduleSources.catalogueService,
    moduleFiles.catalogueService.name,
    {
      CATALOGUE_CONFIG: CATALOGUE_CONFIG,
      getRuntimeConfiguration_: getRuntimeConfiguration_,

      listProductSummaries_: listProductSummaries_,
      getProductTemplateContext_: getProductTemplateContext_,

      getRequiredWebResources_:
        driveFileService.getRequiredWebResources_,

      readDriveJsonFileById_:
        driveFileService.readDriveJsonFileById_,

      readDriveTextFileById_:
        driveFileService.readDriveTextFileById_,

      listFolderFiles_:
        driveFileService.listFolderFiles_,

      createFileIndex_:
        driveFileService.createFileIndex_,

      findFileInIndex_:
        driveFileService.findFileInIndex_,

      validateReplacementMap_:
        docxPdfService.validateReplacementMap_,

      validateParameterMappingDocument_:
        docxPdfService.validateParameterMappingDocument_,

      collectAllowedTemplateTags_:
        docxPdfService.collectAllowedTemplateTags_,

      collectImageMappings_:
        docxPdfService.collectImageMappings_,

      inspectTemplateImageDescriptions_:
        docxPdfService.inspectTemplateImageDescriptions_,

      generateProductDatasheetPdf_:
        docxPdfService.generateProductDatasheetPdf_,

      clearAllCatalogueCaches_: clearAllCatalogueCaches_,

      Drive: Drive,
      console: console,
      Date: Date
    },
    [
      'getCatalogueBootstrap',
      'getProductTemplateContext',
      'generateProductDatasheetPdf',
      'refreshCatalogueCache',
      'testConfiguration',
      'runTemplateGenerationTest',
      'runTemplateImageDescriptionTest'
    ]
  );

  SERVER_MODULE_RUNTIME_CACHE_ = Object.freeze({
    driveFileService: driveFileService,
    workbookService: workbookService,
    docxPdfService: docxPdfService,
    catalogueService: catalogueService,

    diagnostics: Object.freeze({
      loadedAt: new Date().toISOString(),
      webFolderId: runtimeConfig.webFolderId,
      modules: Object.freeze(diagnostics)
    })
  });

  return SERVER_MODULE_RUNTIME_CACHE_;
}

/**
 * Clears only the in-memory module runtime for the current execution.
 */
function resetServerModuleRuntime_() {
  SERVER_MODULE_RUNTIME_CACHE_ = null;
}

/**
 * Compiles one trusted Drive module factory and validates its exports.
 *
 * @param {string} source
 * @param {string} fileName
 * @param {Object} dependencies
 * @param {Array<string>} requiredExports
 * @return {Object}
 */
function createServerModule_(
  source,
  fileName,
  dependencies,
  requiredExports
) {
  let factory;

  try {
    factory = Function(
      '"use strict";\n' +
      'return (\n' +
      source +
      '\n);'
    )();
  } catch (error) {
    throw new Error(
      'Server module compilation failed for ' +
      fileName +
      ': ' +
      error.message
    );
  }

  if (typeof factory !== 'function') {
    throw new Error(
      'Server module must export a factory function: ' +
      fileName
    );
  }

  let moduleApi;

  try {
    moduleApi = factory(
      Object.freeze(dependencies)
    );
  } catch (error) {
    throw new Error(
      'Server module initialization failed for ' +
      fileName +
      ': ' +
      error.message
    );
  }

  if (
    !moduleApi ||
    typeof moduleApi !== 'object' ||
    Array.isArray(moduleApi)
  ) {
    throw new Error(
      'Server module factory returned an invalid API: ' +
      fileName
    );
  }

  (requiredExports || []).forEach(function (exportName) {
    if (typeof moduleApi[exportName] !== 'function') {
      throw new Error(
        'Server module ' +
        fileName +
        ' is missing function export: ' +
        exportName
      );
    }
  });

  return Object.freeze(moduleApi);
}

/**
 * Minimal bootstrap listing used before DriveFileService.js is available.
 */
function bootstrapListFolderFiles_(folderId) {
  const files = [];
  let pageToken = null;

  do {
    const response = Drive.Files.list({
      q:
        "'" +
        bootstrapEscapeDriveQueryValue_(folderId) +
        "' in parents and trashed = false",
      pageSize: 1000,
      pageToken: pageToken || undefined,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields:
        'nextPageToken,' +
        'files(id,name,mimeType,modifiedTime,size)'
    });

    (response.files || []).forEach(function (file) {
      files.push(file);
    });

    pageToken = response.nextPageToken || null;
  } while (pageToken);

  return files;
}

function bootstrapEscapeDriveQueryValue_(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function bootstrapCreateFileIndex_(files) {
  const byName = {};

  (files || []).forEach(function (file) {
    const normalized = String(file.name || '')
      .trim()
      .toLowerCase();

    if (normalized) {
      byName[normalized] = file;
    }
  });

  return {
    files: files || [],
    byName: byName
  };
}

function bootstrapFindRequiredFile_(index, fileName) {
  const normalized = String(fileName || '')
    .trim()
    .toLowerCase();

  const file = index.byName[normalized];

  if (!file) {
    throw new Error(
      'Required server module not found in WEB_FOLDER_ID: ' +
      fileName
    );
  }

  return file;
}

function bootstrapReadTextFile_(fileId) {
  return DriveApp
    .getFileById(fileId)
    .getBlob()
    .getDataAsString('UTF-8');
}

function bootstrapSha256Text_(text) {
  const bytes = Utilities.newBlob(
    String(text),
    'text/javascript'
  ).getBytes();

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    bytes
  );

  return digest.map(function (value) {
    const unsigned = value < 0
      ? value + 256
      : value;

    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

/**
 * Internal compatibility wrappers used by remaining .gs files.
 */

function listFolderFiles_(folderId) {
  return getServerModuleRuntime_()
    .driveFileService
    .listFolderFiles_(folderId);
}

function createFileIndex_(files) {
  return getServerModuleRuntime_()
    .driveFileService
    .createFileIndex_(files);
}

function findFileInIndex_(index, reference) {
  return getServerModuleRuntime_()
    .driveFileService
    .findFileInIndex_(index, reference);
}

function findRequiredFileInIndex_(index, fileName) {
  return getServerModuleRuntime_()
    .driveFileService
    .findRequiredFileInIndex_(index, fileName);
}

function readDriveTextFileById_(fileId) {
  return getServerModuleRuntime_()
    .driveFileService
    .readDriveTextFileById_(fileId);
}

function readDriveJsonFileById_(fileId) {
  return getServerModuleRuntime_()
    .driveFileService
    .readDriveJsonFileById_(fileId);
}

function getWebFolderIndex_() {
  return getServerModuleRuntime_()
    .driveFileService
    .getWebFolderIndex_();
}

function optionalFontFaceCss_(webIndex) {
  return getServerModuleRuntime_()
    .driveFileService
    .optionalFontFaceCss_(webIndex);
}

function getRequiredWebResources_() {
  return getServerModuleRuntime_()
    .driveFileService
    .getRequiredWebResources_();
}

function getDatabaseSnapshot_() {
  return getServerModuleRuntime_()
    .workbookService
    .getDatabaseSnapshot_();
}

function generateProductDatasheetPdf_(
  engineeringCode,
  replacements,
  includePdfData,
  resources
) {
  return getServerModuleRuntime_()
    .docxPdfService
    .generateProductDatasheetPdf_(
      engineeringCode,
      replacements,
      includePdfData,
      resources
    );
}

function validateReplacementMap_(
  replacements,
  mapping,
  additionalAllowedTags
) {
  return getServerModuleRuntime_()
    .docxPdfService
    .validateReplacementMap_(
      replacements,
      mapping,
      additionalAllowedTags
    );
}

function validateParameterMappingDocument_(mapping) {
  return getServerModuleRuntime_()
    .docxPdfService
    .validateParameterMappingDocument_(mapping);
}

function collectAllowedTemplateTags_(mapping) {
  return getServerModuleRuntime_()
    .docxPdfService
    .collectAllowedTemplateTags_(mapping);
}


function resolveGraphicFile_(folderId, reference) {
  return getServerModuleRuntime_()
    .driveFileService
    .resolveGraphicFile_(folderId, reference);
}

function getGraphicImageBlob_(fileMetadata) {
  return getServerModuleRuntime_()
    .driveFileService
    .getGraphicImageBlob_(fileMetadata);
}

function collectImageMappings_(mapping) {
  return getServerModuleRuntime_()
    .docxPdfService
    .collectImageMappings_(mapping);
}

function inspectTemplateImageDescriptions_(
  resources
) {
  return getServerModuleRuntime_()
    .docxPdfService
    .inspectTemplateImageDescriptions_(
      resources
    );
}

/**
 * Returns module metadata without exposing module source.
 *
 * @return {Object}
 */
function getServerModuleDiagnostics_() {
  return getServerModuleRuntime_().diagnostics;
}

/**
 * Manual loader test visible in the Apps Script execution log.
 *
 * @return {Object}
 */
function runServerModuleTest() {
  resetServerModuleRuntime_();

  const diagnostics = getServerModuleDiagnostics_();

  console.log(
    JSON.stringify(diagnostics, null, 2)
  );

  return diagnostics;
}

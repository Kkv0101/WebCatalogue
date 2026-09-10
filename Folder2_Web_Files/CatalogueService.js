(function createCatalogueServiceModule(deps) {
  'use strict';

  const CATALOGUE_CONFIG = deps.CATALOGUE_CONFIG;
  const getRuntimeConfiguration_ =
    deps.getRuntimeConfiguration_;

  const listProductSummaries_ =
    deps.listProductSummaries_;

  const getProductTemplateContext_ =
    deps.getProductTemplateContext_;

  const getProductThumbnailReference_ =
    deps.getProductThumbnailReference_;

  const resolveGraphicFile_ =
    deps.resolveGraphicFile_;

  const getGraphicImageBlob_ =
    deps.getGraphicImageBlob_;

  const getRequiredWebResources_ =
    deps.getRequiredWebResources_;

  const readDriveJsonFileById_ =
    deps.readDriveJsonFileById_;

  const readDriveTextFileById_ =
    deps.readDriveTextFileById_;

  const listFolderFiles_ =
    deps.listFolderFiles_;

  const createFileIndex_ =
    deps.createFileIndex_;

  const findFileInIndex_ =
    deps.findFileInIndex_;

  const validateReplacementMap_ =
    deps.validateReplacementMap_;

  const validateParameterMappingDocument_ =
    deps.validateParameterMappingDocument_;

  const collectAllowedTemplateTags_ =
    deps.collectAllowedTemplateTags_;

  const collectImageMappings_ =
    deps.collectImageMappings_;

  const inspectTemplateImageDescriptions_ =
    deps.inspectTemplateImageDescriptions_;

  const generateProductDatasheetPdf_ =
    deps.generateProductDatasheetPdf_;

  const clearAllCatalogueCaches_ =
    deps.clearAllCatalogueCaches_;

  const Drive = deps.Drive;
  const DriveApp = deps.DriveApp;
  const Utilities = deps.Utilities;
  const console = deps.console;
  const DateObject = deps.Date;
  const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

  /**
   * SERVER-SIDE MODULE.
   *
   * Public methods are exposed through ServerApi.gs.
   */

  function getCatalogueBootstrap() {
    const products = listProductSummaries_();

    return {
      products: products,

      filters: {
        refrigerants: uniqueSorted_(
          products.map(function (product) {
            return product.refrigerant;
          })
        ),

        applications: uniqueSorted_(
          products.map(function (product) {
            return product.application;
          })
        ),

        motorTypes: uniqueSorted_(
          products.map(function (product) {
            return product.motorType;
          })
        )
      },

      generatedAt:
        new DateObject().toISOString()
    };
  }

  function getProductTemplateContext(
    engineeringCode,
    standard
  ) {
    validateProductCode_(engineeringCode);

    return getProductTemplateContext_(
      engineeringCode,
      standard
    );
  }

  /**
   * Loads a drawing on demand through the authenticated Apps Script API.
   * Drive-generated thumbnails keep catalogue payloads small; originals are
   * used only when Drive has no thumbnail and the source fits the size cap.
   * Missing or inaccessible graphics must not prevent catalogue use.
   */
  function getProductThumbnail(engineeringCode) {
    validateProductCode_(engineeringCode);

    const empty = { dataUrl: '' };
    const reference =
      getProductThumbnailReference_(engineeringCode);

    if (!reference) return empty;

    try {
      const file = resolveGraphicFile_(
        getRuntimeConfiguration_().graphic3dFolderId,
        reference
      );

      if (!file) return empty;

      let blob = null;

      try {
        blob = DriveApp.getFileById(file.id).getThumbnail();
      } catch (error) {
        console.warn('Drive thumbnail unavailable: ' + error.message);
      }

      if (!blob) {
        const sourceSize = Number(file.size);

        // File listings include source size. Do not fetch an unbounded
        // original if Drive could not report its size.
        if (
          !Number.isFinite(sourceSize) ||
          sourceSize <= 0 ||
          sourceSize > MAX_THUMBNAIL_BYTES
        ) {
          return empty;
        }

        blob = getGraphicImageBlob_(file);
      }

      const mimeType = String(blob.getContentType() || '').toLowerCase();

      if (!/^image\/(png|jpeg|gif|webp)$/.test(mimeType)) {
        return empty;
      }

      const bytes = blob.getBytes();

      if (!bytes.length || bytes.length > MAX_THUMBNAIL_BYTES) {
        return empty;
      }

      return {
        dataUrl: 'data:' + mimeType + ';base64,' +
          Utilities.base64Encode(bytes)
      };
    } catch (error) {
      console.warn('Product thumbnail unavailable: ' + error.message);
      return empty;
    }
  }

  function generateProductDatasheetPdf(
    engineeringCode,
    replacements,
    standard
  ) {
    validateProductCode_(engineeringCode);

    const resources =
      getRequiredWebResources_();

    const mapping =
      readDriveJsonFileById_(
        resources.parameterMapping.id
      );

    const context =
      getProductTemplateContext_(
        engineeringCode,
        standard
      );

    const serverPerformanceReplacements =
      context.performanceCurveReplacements ||
      {};

    const performanceCurveTags =
      Object.keys(
        serverPerformanceReplacements
      );

    // Start with browser-generated ordinary replacements, then force the
    // server-calculated Performance_Curve.csv values on top. This guarantees
    // Te / CC(CAP) / COP / CON tags are present even when the browser has a
    // stale TemplateMappingService.js or cached page.
    const mergedReplacements = {};

    Object.keys(
      replacements || {}
    ).forEach(
      function (tag) {
        mergedReplacements[tag] =
          replacements[tag];
      }
    );

    performanceCurveTags.forEach(
      function (tag) {
        mergedReplacements[tag] =
          serverPerformanceReplacements[tag];
      }
    );

    // Rated Point values and the standard label are authoritative on the server,
    // just like the detailed curve values. Never accept stale RG20 values for SH10.
    (mapping.computedFields || []).filter(function (field) {
      return field.type === 'ratedPoint';
    }).forEach(function (field) {
      const row = (context.ratedPoints || [])[Number(field.index) || 0] || {};
      const raw = row[field.source];
      const text = raw === null || raw === undefined ? '' : String(raw).trim();
      const blank = field.blankValue === undefined ? (mapping.blankValue || '') : field.blankValue;
      const value = text ? String(field.prefix || '') + text + String(field.suffix || '') : String(blank);
      const tags = (Array.isArray(field.tags) ? field.tags : []).concat(field.tag === undefined ? [] : [field.tag]);
      tags.forEach(function (tag) {
        tag = String(tag || '').trim();
        if (tag && tag.toUpperCase() !== 'N/A' && !/^img_/i.test(tag)) mergedReplacements[tag] = value;
      });
    });

    const normalizedReplacements =
      validateReplacementMap_(
        mergedReplacements,
        mapping,
        performanceCurveTags
      );

    const result =
      generateProductDatasheetPdf_(
        engineeringCode,
        normalizedReplacements,
        true,
        resources,
        {
          standard: context.ratedPoint.standard,
          performanceCurveTagGroups:
            context.performanceCurveTagGroups ||
            []
        }
      );

    result.performanceCurveStatus =
      context.performanceCurveDiagnostics
        ? context.performanceCurveDiagnostics.status
        : '';

    result.standard = context.ratedPoint.standard;

    result.performanceCurveMatchedRows =
      context.performanceCurveDiagnostics
        ? context.performanceCurveDiagnostics
            .matchedDefinitionRows
        : 0;

    result.performanceCurveReplacementTags =
      performanceCurveTags.length;

    return result;
  }

  function refreshCatalogueCache() {
    clearAllCatalogueCaches_();

    return {
      cleared: true,
      products:
        listProductSummaries_().length,
      refreshedAt:
        new DateObject().toISOString()
    };
  }

  function testConfiguration() {
    const runtime =
      getRuntimeConfiguration_();

    const webFiles =
      listFolderFiles_(
        runtime.webFolderId
      );

    const webIndex =
      createFileIndex_(webFiles);

    const requiredWebFileNames =
      Object.keys(
        CATALOGUE_CONFIG.WEB_FILES
      ).map(function (key) {
        return CATALOGUE_CONFIG
          .WEB_FILES[key];
      });

    const requiredServerModuleNames =
      Object.keys(
        CATALOGUE_CONFIG.SERVER_MODULE_FILES
      ).map(function (key) {
        return CATALOGUE_CONFIG
          .SERVER_MODULE_FILES[key];
      });

    const requiredFileNames =
      requiredWebFileNames.concat(
        requiredServerModuleNames
      );

    const missingWebFiles =
      requiredFileNames.filter(
        function (name) {
          return !findFileInIndex_(
            webIndex,
            name
          );
        }
      );

    let mappingSummary = null;
    let templateSummary = null;
    let mappingScriptSummary = null;

    const serverModuleSummary = {};
    const warnings = [];

    const mappingFile =
      findFileInIndex_(
        webIndex,
        CATALOGUE_CONFIG
          .WEB_FILES
          .parameterMapping
      );

    if (mappingFile) {
      const mapping =
        readDriveJsonFileById_(
          mappingFile.id
        );

      validateParameterMappingDocument_(
        mapping
      );

      mappingSummary = {
        fileName: mappingFile.name,
        version: mapping.version || 1,
        fields:
          (mapping.fields || []).length,
        computedFields:
          (mapping.computedFields || [])
            .length,
        performanceCurves:
          (mapping.performanceCurves || [])
            .length,
        allowedTextTags:
          Object.keys(
            collectAllowedTemplateTags_(
              mapping
            )
          ).length,
        imageMappings:
          collectImageMappings_(mapping)
      };
    }

    const mappingScriptFile =
      findFileInIndex_(
        webIndex,
        CATALOGUE_CONFIG
          .WEB_FILES
          .templateMappingScript
      );

    if (mappingScriptFile) {
      mappingScriptSummary = {
        id: mappingScriptFile.id,
        name: mappingScriptFile.name,
        mimeType:
          mappingScriptFile.mimeType,
        size:
          mappingScriptFile.size || ''
      };

      const scriptText =
        readDriveTextFileById_(
          mappingScriptFile.id
        );

      if (
        scriptText.indexOf(
          'TemplateMappingService'
        ) === -1 ||
        scriptText.indexOf(
          'buildReplacementMap'
        ) === -1
      ) {
        warnings.push(
          'TemplateMappingService.js does not expose ' +
          'the expected mapping API.'
        );
      }
    }

    let performanceCurveSummary = null;

    const performanceCurveFile =
      findFileInIndex_(
        webIndex,
        CATALOGUE_CONFIG
          .WEB_FILES
          .performanceCurveCsv
      );

    if (performanceCurveFile) {
      performanceCurveSummary = {
        id:
          performanceCurveFile.id,
        name:
          performanceCurveFile.name,
        mimeType:
          performanceCurveFile.mimeType,
        modifiedTime:
          performanceCurveFile.modifiedTime || '',
        size:
          performanceCurveFile.size || ''
      };
    }

    const templateFile =
      findFileInIndex_(
        webIndex,
        CATALOGUE_CONFIG
          .WEB_FILES
          .datasheetTemplate
      );

    if (templateFile) {
      templateSummary = {
        id: templateFile.id,
        name: templateFile.name,
        mimeType: templateFile.mimeType,
        size: templateFile.size || ''
      };

      if (
        !/\.docx$/i.test(
          templateFile.name
        )
      ) {
        warnings.push(
          'Datasheet template filename does not end with .docx.'
        );
      }
    }

    Object.keys(
      CATALOGUE_CONFIG.SERVER_MODULE_FILES
    ).forEach(function (key) {
      const fileName =
        CATALOGUE_CONFIG
          .SERVER_MODULE_FILES[key];

      const file =
        findFileInIndex_(
          webIndex,
          fileName
        );

      serverModuleSummary[key] = file
        ? {
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            modifiedTime:
              file.modifiedTime || '',
            size: file.size || ''
          }
        : null;
    });

    const graphicFolders = {
      DRAWING_3d: {
        folderId:
          runtime.graphic3dFolderId,
        fallbackToDataFolder:
          runtime.graphicFolderFallbackUsed
            .DRAWING_3d,
        fileCount:
          listFolderFiles_(
            runtime.graphic3dFolderId
          ).length
      },

      EXTERNAL_DIMENSIONS: {
        folderId:
          runtime.graphicDimensionsFolderId,
        fallbackToDataFolder:
          runtime.graphicFolderFallbackUsed
            .EXTERNAL_DIMENSIONS,
        fileCount:
          listFolderFiles_(
            runtime.graphicDimensionsFolderId
          ).length
      },

      ELECTRICAL_DIAGRAM: {
        folderId:
          runtime.graphicElectricalFolderId,
        fallbackToDataFolder:
          runtime.graphicFolderFallbackUsed
            .ELECTRICAL_DIAGRAM,
        fileCount:
          listFolderFiles_(
            runtime.graphicElectricalFolderId
          ).length
      },

      ENVELOPE: {
        folderId:
          runtime.graphicEnvelopeFolderId,
        fallbackToDataFolder:
          runtime.graphicFolderFallbackUsed
            .ENVELOPE,
        fileCount:
          listFolderFiles_(
            runtime.graphicEnvelopeFolderId
          ).length
      }
    };

    const bootstrap =
      getCatalogueBootstrap();

    return {
      configured: true,
      applicationVersion:
        CATALOGUE_CONFIG.VERSION,

      database: Drive.Files.get(
        runtime.databaseFileId,
        {
          supportsAllDrives: true,
          fields:
            'id,name,mimeType,modifiedTime'
        }
      ),

      dataFolderFileCount:
        listFolderFiles_(
          runtime.dataFolderId
        ).length,

      webFolderFileCount:
        webFiles.length,

      productCount:
        bootstrap.products.length,

      missingWebFiles:
        missingWebFiles,

      template:
        templateSummary,

      performanceCurveCsv:
        performanceCurveSummary,

      mapping:
        mappingSummary,

      templateMappingScript:
        mappingScriptSummary,

      serverModules:
        serverModuleSummary,

      graphicFolders:
        graphicFolders,

      graphicFormats:
        CATALOGUE_CONFIG.GRAPHIC_EXTENSIONS,

      mappingExecution: 'browser',
      serverModuleExecution:
        'Apps Script V8 dynamic factory loader',

      pdfDeliveryMode:
        'browser-blob-new-tab',

      generatedPdfStoredInDrive:
        false,

      legacyGraphicFoldersIgnored:
        true,

      legacyPreviewFolderIgnored:
        true,

      warnings: warnings
    };
  }

  function runTemplateGenerationTest() {
    const products =
      listProductSummaries_();

    if (!products.length) {
      throw new Error(
        'No catalogue products are available for testing.'
      );
    }

    const product = products[0];

    const resources =
      getRequiredWebResources_();

    const mapping =
      readDriveJsonFileById_(
        resources.parameterMapping.id
      );

    const context =
      getProductTemplateContext_(
        product.engineeringCode
      );

    const serverPerformanceReplacements =
      context.performanceCurveReplacements ||
      {};

    const performanceCurveTags =
      Object.keys(
        serverPerformanceReplacements
      );

    const sourceReplacements = {
      ZZMODEL: product.model,
      BOM: product.engineeringCode
    };

    performanceCurveTags.forEach(
      function (tag) {
        sourceReplacements[tag] =
          serverPerformanceReplacements[tag];
      }
    );

    const replacements =
      validateReplacementMap_(
        sourceReplacements,
        mapping,
        performanceCurveTags
      );

    const result =
      generateProductDatasheetPdf_(
        product.engineeringCode,
        replacements,
        false,
        resources,
        {
          performanceCurveTagGroups:
            context.performanceCurveTagGroups ||
            []
        }
      );

    result.testMode =
      'Server conversion test including Performance_Curve.csv replacements.';

    return result;
  }

  function runTemplateImageDescriptionTest() {
    const resources =
      getRequiredWebResources_();

    return inspectTemplateImageDescriptions_(
      resources
    );
  }

  function validateProductCode_(value) {
    const code =
      String(value || '').trim();

    if (!code) {
      throw new Error(
        'Product engineering code is required.'
      );
    }

    if (
      code.length >
      CATALOGUE_CONFIG.MAX_PRODUCT_ID_LENGTH
    ) {
      throw new Error(
        'Product code is too long.'
      );
    }

    if (!/^[A-Za-z0-9._-]+$/.test(code)) {
      throw new Error(
        'Product code contains unsupported characters.'
      );
    }
  }

  function uniqueSorted_(values) {
    const found = {};

    values.forEach(function (value) {
      const normalized =
        String(value || '').trim();

      if (normalized) {
        found[normalized] = true;
      }
    });

    return Object.keys(found).sort(
      function (a, b) {
        return a.localeCompare(b);
      }
    );
  }

  return Object.freeze({
    moduleName: 'CatalogueService',
    moduleVersion: '7.6.6',

    getCatalogueBootstrap:
      getCatalogueBootstrap,

    getProductTemplateContext:
      getProductTemplateContext,

    getProductThumbnail:
      getProductThumbnail,

    generateProductDatasheetPdf:
      generateProductDatasheetPdf,

    refreshCatalogueCache:
      refreshCatalogueCache,

    testConfiguration:
      testConfiguration,

    runTemplateGenerationTest:
      runTemplateGenerationTest,

    runTemplateImageDescriptionTest:
      runTemplateImageDescriptionTest
  });
})

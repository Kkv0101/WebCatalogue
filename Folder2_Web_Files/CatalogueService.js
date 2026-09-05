(function createCatalogueServiceModule(deps) {
  'use strict';

  const CATALOGUE_CONFIG = deps.CATALOGUE_CONFIG;
  const getRuntimeConfiguration_ =
    deps.getRuntimeConfiguration_;

  const listProductSummaries_ =
    deps.listProductSummaries_;

  const getProductTemplateContext_ =
    deps.getProductTemplateContext_;

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
  const console = deps.console;
  const DateObject = deps.Date;

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
    engineeringCode
  ) {
    validateProductCode_(engineeringCode);

    return getProductTemplateContext_(
      engineeringCode
    );
  }

  function generateProductDatasheetPdf(
    engineeringCode,
    replacements
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
        engineeringCode
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
          performanceCurveTagGroups:
            context.performanceCurveTagGroups ||
            []
        }
      );

    result.performanceCurveStatus =
      context.performanceCurveDiagnostics
        ? context.performanceCurveDiagnostics.status
        : '';

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

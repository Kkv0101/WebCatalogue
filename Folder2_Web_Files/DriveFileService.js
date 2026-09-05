(function createDriveFileServiceModule(deps) {
  'use strict';

  const CATALOGUE_CONFIG = deps.CATALOGUE_CONFIG;
  const getRuntimeConfiguration_ =
    deps.getRuntimeConfiguration_;

  const Drive = deps.Drive;
  const DriveApp = deps.DriveApp;
  const Utilities = deps.Utilities;

  /**
   * SERVER-SIDE MODULE.
   *
   * This file is stored in WEB_FOLDER_ID but is executed by
   * RuntimeModuleLoader.gs, not by the browser.
   */

  function listFolderFiles_(folderId) {
    const files = [];
    let pageToken = null;

    do {
      const response = Drive.Files.list({
        q:
          "'" +
          escapeDriveQueryValue_(folderId) +
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

  function escapeDriveQueryValue_(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
  }

  function createFileIndex_(files) {
    const byName = {};
    const byStem = {};

    (files || []).forEach(function (file) {
      const lowerName = String(file.name || '')
        .trim()
        .toLowerCase();

      if (!lowerName) return;

      byName[lowerName] = choosePreferredFile_(
        byName[lowerName],
        file
      );

      byStem[
        lowerName.replace(/\.[^.]+$/, '')
      ] = choosePreferredFile_(
        byStem[
          lowerName.replace(/\.[^.]+$/, '')
        ],
        file
      );
    });

    return {
      files: files || [],
      byName: byName,
      byStem: byStem
    };
  }

  function choosePreferredFile_(current, candidate) {
    if (!current) return candidate;

    return graphicFilePriority_(candidate) >
      graphicFilePriority_(current)
        ? candidate
        : current;
  }

  function graphicFilePriority_(file) {
    const extension =
      fileExtension_(file && file.name);

    if (extension === 'png') return 3;
    if (extension === 'jpg') return 2;
    if (extension === 'jpeg') return 1;

    return 0;
  }

  function fileExtension_(fileName) {
    const match = String(fileName || '')
      .trim()
      .toLowerCase()
      .match(/\.([^.]+)$/);

    return match ? match[1] : '';
  }

  function findFileInIndex_(index, reference) {
    if (!index || !reference) return null;

    const normalized = String(reference)
      .trim()
      .toLowerCase();

    if (!normalized) return null;

    return index.byName[normalized] ||
      index.byStem[
        normalized.replace(/\.[^.]+$/, '')
      ] ||
      null;
  }

  function findRequiredFileInIndex_(index, fileName) {
    const file = findFileInIndex_(index, fileName);

    if (!file) {
      throw new Error(
        'Required file not found in WEB_FOLDER_ID: ' +
        fileName
      );
    }

    return file;
  }

  function readDriveTextFileById_(fileId) {
    return DriveApp
      .getFileById(fileId)
      .getBlob()
      .getDataAsString('UTF-8');
  }

  function readDriveJsonFileById_(fileId) {
    const text = readDriveTextFileById_(fileId);

    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(
        'Invalid JSON file: ' +
        error.message
      );
    }
  }

  function getWebFolderIndex_() {
    const runtime = getRuntimeConfiguration_();

    return createFileIndex_(
      listFolderFiles_(runtime.webFolderId)
    );
  }

  function optionalFontFaceCss_(webIndex) {
    const declarations = [];

    [
      {
        fileName:
          CATALOGUE_CONFIG.FONT_FILES.thin,
        weight: 200
      },
      {
        fileName:
          CATALOGUE_CONFIG.FONT_FILES.regular,
        weight: 400
      },
      {
        fileName:
          CATALOGUE_CONFIG.FONT_FILES.bold,
        weight: 700
      }
    ].forEach(function (font) {
      const file = findFileInIndex_(
        webIndex,
        font.fileName
      );

      if (!file) return;

      const blob = DriveApp
        .getFileById(file.id)
        .getBlob();

      const dataUrl =
        'data:font/otf;base64,' +
        Utilities.base64Encode(
          blob.getBytes()
        );

      declarations.push(
        "@font-face{" +
        "font-family:'Embraco BeauSans';" +
        "src:url('" +
        dataUrl +
        "') format('opentype');" +
        "font-style:normal;" +
        "font-weight:" +
        font.weight +
        ";" +
        "font-display:swap;" +
        "}"
      );
    });

    return declarations.join('\n');
  }

  function getRequiredWebResources_() {
    const index = getWebFolderIndex_();
    const names = CATALOGUE_CONFIG.WEB_FILES;

    return {
      index: index,

      indexHtml:
        findRequiredFileInIndex_(
          index,
          names.index
        ),

      styles:
        findRequiredFileInIndex_(
          index,
          names.styles
        ),

      templateMappingScript:
        findRequiredFileInIndex_(
          index,
          names.templateMappingScript
        ),

      appScript:
        findRequiredFileInIndex_(
          index,
          names.appScript
        ),

      uiConfig:
        findRequiredFileInIndex_(
          index,
          names.uiConfig
        ),

      datasheetTemplate:
        findRequiredFileInIndex_(
          index,
          names.datasheetTemplate
        ),

      parameterMapping:
        findRequiredFileInIndex_(
          index,
          names.parameterMapping
        ),

      performanceCurveCsv:
        findRequiredFileInIndex_(
          index,
          names.performanceCurveCsv
        )
    };
  }

  /**
   * Resolves a graphic by exact filename first and then by filename stem.
   *
   * Accepted formats: PNG, JPG and JPEG. Filename matching is
   * case-insensitive. When no extension is provided, PNG is preferred.
   *
   * @param {string} folderId
   * @param {string} reference
   * @return {Object|null}
   */
  function resolveGraphicFile_(folderId, reference) {
    const normalizedReference =
      String(reference || '').trim();

    if (!normalizedReference) return null;

    const allowed =
      CATALOGUE_CONFIG.GRAPHIC_EXTENSIONS;

    const graphicFiles =
      listFolderFiles_(folderId).filter(
        function (file) {
          return allowed.indexOf(
            fileExtension_(file.name)
          ) !== -1;
        }
      );

    const index =
      createFileIndex_(graphicFiles);

    return findFileInIndex_(
      index,
      normalizedReference
    );
  }

  /**
   * Returns a Drive image blob with a normalized MIME type.
   *
   * @param {Object} fileMetadata
   * @return {GoogleAppsScript.Base.Blob}
   */
  function getGraphicImageBlob_(fileMetadata) {
    if (!fileMetadata || !fileMetadata.id) {
      throw new Error(
        'Graphic file metadata is missing.'
      );
    }

    const extension =
      fileExtension_(fileMetadata.name);

    if (
      CATALOGUE_CONFIG.GRAPHIC_EXTENSIONS
        .indexOf(extension) === -1
    ) {
      throw new Error(
        'Unsupported graphic format: ' +
        fileMetadata.name
      );
    }

    const contentType =
      extension === 'png'
        ? 'image/png'
        : 'image/jpeg';

    return DriveApp
      .getFileById(fileMetadata.id)
      .getBlob()
      .setName(fileMetadata.name)
      .setContentType(contentType);
  }

  return Object.freeze({
    moduleName: 'DriveFileService',
    moduleVersion: '7.6.6',

    listFolderFiles_: listFolderFiles_,
    createFileIndex_: createFileIndex_,
    findFileInIndex_: findFileInIndex_,
    findRequiredFileInIndex_:
      findRequiredFileInIndex_,
    readDriveTextFileById_:
      readDriveTextFileById_,
    readDriveJsonFileById_:
      readDriveJsonFileById_,
    getWebFolderIndex_:
      getWebFolderIndex_,
    optionalFontFaceCss_:
      optionalFontFaceCss_,
    getRequiredWebResources_:
      getRequiredWebResources_,
    resolveGraphicFile_:
      resolveGraphicFile_,
    getGraphicImageBlob_:
      getGraphicImageBlob_
  });
})

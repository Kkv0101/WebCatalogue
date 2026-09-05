(function createWorkbookServiceModule(deps) {
  'use strict';

  const CATALOGUE_CONFIG = deps.CATALOGUE_CONFIG;
  const getRuntimeConfiguration_ =
    deps.getRuntimeConfiguration_;

  const cacheGetLarge_ = deps.cacheGetLarge_;
  const cachePutLarge_ = deps.cachePutLarge_;

  const LockService = deps.LockService;
  const Drive = deps.Drive;
  const DriveApp = deps.DriveApp;
  const SpreadsheetApp = deps.SpreadsheetApp;
  const console = deps.console;

  /**
   * SERVER-SIDE MODULE.
   *
   * Supports native Google Sheets and XLSX conversion.
   */

  function getDatabaseSnapshot_() {
    const cached = cacheGetLarge_(
      'catalogue:snapshot'
    );

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (error) {
        console.warn(error.message);
      }
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      const secondCheck = cacheGetLarge_(
        'catalogue:snapshot'
      );

      if (secondCheck) {
        return JSON.parse(secondCheck);
      }

      const snapshot = readDatabaseSnapshot_();

      cachePutLarge_(
        'catalogue:snapshot',
        JSON.stringify(snapshot),
        CATALOGUE_CONFIG.CACHE_SECONDS
      );

      return snapshot;
    } finally {
      lock.releaseLock();
    }
  }

  function readDatabaseSnapshot_() {
    const runtime = getRuntimeConfiguration_();

    const metadata = Drive.Files.get(
      runtime.databaseFileId,
      {
        supportsAllDrives: true,
        fields:
          'id,name,mimeType,modifiedTime'
      }
    );

    let spreadsheetId = metadata.id;
    let temporaryFileId = null;

    if (
      metadata.mimeType !==
      'application/vnd.google-apps.spreadsheet'
    ) {
      if (
        !/spreadsheetml|excel/i.test(
          metadata.mimeType || ''
        ) &&
        !/\.xlsx$/i.test(metadata.name || '')
      ) {
        throw new Error(
          'Database must be a Google Sheet or XLSX file. ' +
          'Current MIME type: ' +
          metadata.mimeType
        );
      }

      const sourceBlob = DriveApp
        .getFileById(metadata.id)
        .getBlob();

      const converted = Drive.Files.create({
        name:
          '_catalogue_temp_' +
          Date.now(),
        mimeType:
          'application/vnd.google-apps.spreadsheet'
      }, sourceBlob, {
        fields: 'id',
        supportsAllDrives: true
      });

      spreadsheetId = converted.id;
      temporaryFileId = converted.id;
    }

    try {
      const spreadsheet =
        SpreadsheetApp.openById(spreadsheetId);

      return {
        database: {
          id: metadata.id,
          name: metadata.name,
          mimeType: metadata.mimeType,
          modifiedTime:
            metadata.modifiedTime || ''
        },

        products: readSheetObjects_(
          spreadsheet,
          CATALOGUE_CONFIG.DATABASE_SHEET,
          true
        ),

        ratedPoints: readSheetObjects_(
          spreadsheet,
          CATALOGUE_CONFIG.RATED_POINTS_SHEET,
          false
        ),

        performance: readSheetObjects_(
          spreadsheet,
          CATALOGUE_CONFIG.PERFORMANCE_SHEET,
          false
        ),

        envelopePoints: readSheetObjects_(
          spreadsheet,
          CATALOGUE_CONFIG.ENVELOPE_POINTS_SHEET,
          false
        ),

        curveCoefficients: readSheetObjects_(
          spreadsheet,
          CATALOGUE_CONFIG.CURVE_COEFFICIENTS_SHEET,
          false
        ),

        standardTemp: readSheetObjects_(
          spreadsheet,
          CATALOGUE_CONFIG.STANDARD_TEMP_SHEET,
          false
        )
      };
    } finally {
      if (temporaryFileId) {
        try {
          Drive.Files.update(
            { trashed: true },
            temporaryFileId,
            null,
            { supportsAllDrives: true }
          );
        } catch (error) {
          console.warn(
            'Temporary converted spreadsheet ' +
            'could not be trashed: ' +
            error.message
          );
        }
      }
    }
  }

  function readSheetObjects_(
    spreadsheet,
    sheetName,
    required
  ) {
    const sheet =
      spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      if (required) {
        throw new Error(
          'Required database sheet not found: ' +
          sheetName
        );
      }

      return [];
    }

    const values =
      sheet.getDataRange().getDisplayValues();

    if (!values.length) return [];

    const headers = values[0].map(
      function (value) {
        return String(value || '').trim();
      }
    );

    return values.slice(1).filter(
      function (row) {
        return row.some(function (cell) {
          return String(cell || '').trim() !== '';
        });
      }
    ).map(function (row) {
      const object = {};

      headers.forEach(function (header, index) {
        if (header) {
          object[header] =
            row[index] === undefined
              ? ''
              : row[index];
        }
      });

      return object;
    });
  }

  return Object.freeze({
    moduleName: 'WorkbookService',
    moduleVersion: '7.6.6',

    getDatabaseSnapshot_: getDatabaseSnapshot_
  });
})

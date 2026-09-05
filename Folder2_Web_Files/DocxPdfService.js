(function createDocxPdfServiceModule(deps) {
  'use strict';

  const CATALOGUE_CONFIG = deps.CATALOGUE_CONFIG;
  const getRuntimeConfiguration_ =
    deps.getRuntimeConfiguration_;

  const getRequiredWebResources_ =
    deps.getRequiredWebResources_;

  const resolveGraphicFile_ =
    deps.resolveGraphicFile_;

  const getGraphicImageBlob_ =
    deps.getGraphicImageBlob_;

  const getProductTemplateContext_ =
    deps.getProductTemplateContext_;

  const text_ = deps.text_;

  const Drive = deps.Drive;
  const DriveApp = deps.DriveApp;
  const Docs = deps.Docs;
  const DocumentApp = deps.DocumentApp;
  const Utilities = deps.Utilities;
  const console = deps.console;

  /**
   * SERVER-SIDE MODULE.
   *
   * Converts the DOCX template through a temporary Google Document, replaces
   * mapped text and images, and returns the generated PDF as Base64.
   */

  function generateProductDatasheetPdf_(
    engineeringCode,
    replacements,
    includePdfData,
    resources,
    options
  ) {
    const runtime =
      getRuntimeConfiguration_();

    const generationOptions =
      options || {};

    const performanceCurveTagGroups =
      Array.isArray(
        generationOptions
          .performanceCurveTagGroups
      )
        ? generationOptions
            .performanceCurveTagGroups
        : [];

    const webResources =
      resources || getRequiredWebResources_();

    const mapping =
      JSON.parse(
        DriveApp
          .getFileById(
            webResources.parameterMapping.id
          )
          .getBlob()
          .getDataAsString('UTF-8')
      );

    validateParameterMappingDocument_(
      mapping
    );

    const context =
      getProductTemplateContext_(
        engineeringCode
      );

    const warnings = [];
    let temporaryDocumentId = null;

    try {
      const templateBlob = DriveApp
        .getFileById(
          webResources.datasheetTemplate.id
        )
        .getBlob();

      const converted = Drive.Files.create({
        name:
          buildTemporaryDocumentName_(
            context.productRow
          ),
        mimeType:
          CATALOGUE_CONFIG.GOOGLE_DOC_MIME_TYPE
      }, templateBlob, {
        supportsAllDrives: true,
        fields: 'id,name,mimeType'
      });

      temporaryDocumentId = converted.id;

      const replacementResult =
        replaceDocumentText_(
          temporaryDocumentId,
          replacements
        );

      const performanceTags = {};

      performanceCurveTagGroups.forEach(
        function (group) {
          (group.candidateTags || [])
            .forEach(function (tag) {
              performanceTags[tag] = true;
            });
        }
      );

      replacementResult.notFound.forEach(
        function (tag) {
          if (performanceTags[tag]) {
            return;
          }

          warnings.push(
            'Template text tag was not found: ' +
            tag
          );
        }
      );

      const performanceCurveMatches =
        [];

      performanceCurveTagGroups.forEach(
        function (group) {
          const candidates =
            group.candidateTags || [];

          const matchedTags =
            candidates.filter(
              function (tag) {
                return (
                  (
                    replacementResult
                      .occurrencesByTag[tag]
                  ) || 0
                ) > 0;
              }
            );

          performanceCurveMatches.push({
            type:
              group.type || '',
            sourceTag:
              group.sourceTag || '',
            candidateTags:
              candidates,
            matchedTags:
              matchedTags
          });

          if (!matchedTags.length) {
            warnings.push(
              'Performance curve template tag was not found. ' +
              'CSV tag: ' +
              (group.sourceTag || '') +
              '; candidates: ' +
              candidates.join(', ')
            );
          }
        }
      );

      const imageResult =
        replaceDocumentImages_(
          temporaryDocumentId,
          context.productRow,
          mapping,
          runtime
        );

      imageResult.warnings.forEach(
        function (warning) {
          warnings.push(warning);
        }
      );

      Utilities.sleep(400);

      const pdfBlob = DriveApp
        .getFileById(temporaryDocumentId)
        .getAs(CATALOGUE_CONFIG.PDF_MIME_TYPE)
        .setName(
          buildPdfFileName_(
            context.productRow
          )
        );

      const pdfBytes = pdfBlob.getBytes();

      if (
        pdfBytes.length >
        CATALOGUE_CONFIG.MAX_PDF_BYTES
      ) {
        throw new Error(
          'Generated PDF is too large for browser delivery. ' +
          'Size: ' +
          pdfBytes.length +
          ' bytes.'
        );
      }

      const result = {
        fileName: pdfBlob.getName(),
        mimeType:
          CATALOGUE_CONFIG.PDF_MIME_TYPE,
        sizeBytes: pdfBytes.length,
        engineeringCode:
          text_(context.productRow.MATNR),
        model:
          text_(context.productRow.ZZMODEL),
        replacementCount:
          replacementResult.totalOccurrences,
        performanceCurveTagMatches:
          performanceCurveMatches,
        performanceCurveMatchedTagGroups:
          performanceCurveMatches.filter(
            function (item) {
              return item.matchedTags.length > 0;
            }
          ).length,
        performanceCurveTotalTagGroups:
          performanceCurveMatches.length,
        imageReplacementCount:
          imageResult.replacementCount,
        imageReplacements:
          imageResult.replacements,
        imageDescriptionsFound:
          imageResult.descriptionsFound,
        warnings: warnings,
        source: context.database
      };

      if (includePdfData !== false) {
        result.base64 =
          Utilities.base64Encode(pdfBytes);
      }

      return result;
    } finally {
      if (temporaryDocumentId) {
        deleteTemporaryDriveFile_(
          temporaryDocumentId
        );
      }
    }
  }

  /**
   * Replaces inline images by exact Image Description.
   *
   * Missing database values, files or image descriptions do not stop PDF
   * generation. The original template image is retained and a warning is
   * returned.
   */
  function replaceDocumentImages_(
    documentId,
    productRow,
    mapping,
    runtime
  ) {
    const imageMappings =
      collectImageMappings_(mapping);

    const warnings = [];
    const replacements = [];

    const document =
      DocumentApp.openById(documentId);

    const body = document.getBody();
    const images = body.getImages() || [];

    const imagesByDescription = {};
    const descriptionsFound = [];

    images.forEach(function (image) {
      const description = String(
        image.getAltDescription() || ''
      ).trim();

      if (!description) return;

      descriptionsFound.push(description);

      if (!imagesByDescription[description]) {
        imagesByDescription[description] = image;
      }
    });

    imageMappings.forEach(function (imageMapping) {
      const source =
        imageMapping.source;

      const description =
        imageMapping.tag;

      const fileReference =
        text_(productRow[source]);

      const templateImage =
        imagesByDescription[description];

      if (!templateImage) {
        warnings.push(
          'Template image description was not found: ' +
          description
        );
        return;
      }

      if (!fileReference) {
        warnings.push(
          'Database graphic filename is empty: ' +
          source +
          ' → ' +
          description +
          '. The template image was kept.'
        );
        return;
      }

      const folderId =
        resolveGraphicFolderId_(
          source,
          runtime
        );

      const graphicFile =
        resolveGraphicFile_(
          folderId,
          fileReference
        );

      if (!graphicFile) {
        warnings.push(
          'Graphic file was not found: ' +
          fileReference +
          ' for ' +
          source +
          ' in folder ' +
          folderId +
          '. The template image was kept.'
        );
        return;
      }

      try {
        const imageBlob =
          getGraphicImageBlob_(
            graphicFile
          );

        const replacement =
          replaceInlineImage_(
            templateImage,
            imageBlob,
            description
          );

        replacements.push({
          source: source,
          description: description,
          databaseReference:
            fileReference,
          driveFileId:
            graphicFile.id,
          driveFileName:
            graphicFile.name,
          folderId: folderId,
          width: replacement.width,
          height: replacement.height
        });
      } catch (error) {
        warnings.push(
          'Graphic replacement failed for ' +
          description +
          ': ' +
          error.message +
          '. The template image was kept.'
        );
      }
    });

    document.saveAndClose();

    return {
      replacementCount:
        replacements.length,
      replacements: replacements,
      descriptionsFound:
        descriptionsFound,
      warnings: warnings
    };
  }

  function replaceInlineImage_(
    oldImage,
    imageBlob,
    description
  ) {
    const parent = oldImage.getParent();

    if (
      !parent ||
      typeof parent.insertInlineImage !==
        'function'
    ) {
      throw new Error(
        'Image parent does not support inline image insertion.'
      );
    }

    const childIndex =
      parent.getChildIndex(oldImage);

    const frameWidth =
      Math.max(1, oldImage.getWidth());

    const frameHeight =
      Math.max(1, oldImage.getHeight());

    const oldTitle =
      oldImage.getAltTitle();

    const oldLink =
      oldImage.getLinkUrl();

    const newImage =
      parent.insertInlineImage(
        childIndex,
        imageBlob
      );

    fitImageContain_(
      newImage,
      frameWidth,
      frameHeight
    );

    newImage.setAltDescription(
      description
    );

    if (oldTitle) {
      newImage.setAltTitle(oldTitle);
    }

    if (oldLink) {
      newImage.setLinkUrl(oldLink);
    }

    const result = {
      width: newImage.getWidth(),
      height: newImage.getHeight()
    };

    oldImage.removeFromParent();

    return result;
  }

  /**
   * Preserves the graphic aspect ratio and fits it inside the template image
   * frame.
   */
  function fitImageContain_(
    image,
    frameWidth,
    frameHeight
  ) {
    const sourceWidth =
      Math.max(1, image.getWidth());

    const sourceHeight =
      Math.max(1, image.getHeight());

    const scale = Math.min(
      frameWidth / sourceWidth,
      frameHeight / sourceHeight
    );

    const width = Math.max(
      1,
      Math.round(sourceWidth * scale)
    );

    const height = Math.max(
      1,
      Math.round(sourceHeight * scale)
    );

    image.setWidth(width);
    image.setHeight(height);
  }

  function resolveGraphicFolderId_(
    source,
    runtime
  ) {
    const fieldConfig =
      CATALOGUE_CONFIG.GRAPHIC_FIELDS[
        source
      ];

    if (!fieldConfig) {
      throw new Error(
        'No graphic-folder configuration exists for source: ' +
        source
      );
    }

    const folderId =
      runtime[
        fieldConfig.runtimeFolderKey
      ];

    if (!folderId) {
      throw new Error(
        'Graphic folder is not configured for source: ' +
        source
      );
    }

    return folderId;
  }

  function validateReplacementMap_(
    replacements,
    mapping,
    additionalAllowedTags
  ) {
    validateParameterMappingDocument_(mapping);

    if (
      !replacements ||
      typeof replacements !== 'object' ||
      Array.isArray(replacements)
    ) {
      throw new Error(
        'Template replacements must be a JSON object.'
      );
    }

    const keys = Object.keys(replacements);

    if (
      keys.length >
      CATALOGUE_CONFIG.MAX_REPLACEMENT_ENTRIES
    ) {
      throw new Error(
        'Too many template replacements: ' +
        keys.length +
        '.'
      );
    }

    const allowedTags =
      collectAllowedTemplateTags_(mapping);

    (additionalAllowedTags || []).forEach(
      function (tag) {
        const normalizedTag =
          String(tag || '').trim();

        if (
          normalizedTag &&
          !isImageTag_(normalizedTag)
        ) {
          allowedTags[normalizedTag] = true;
        }
      }
    );

    const normalized = {};
    let totalCharacters = 0;

    keys.forEach(function (key) {
      const tag = String(key || '').trim();

      if (!tag) {
        throw new Error(
          'Template replacement contains an empty tag.'
        );
      }

      if (
        tag === '__proto__' ||
        tag === 'prototype' ||
        tag === 'constructor'
      ) {
        throw new Error(
          'Unsupported template tag: ' +
          tag
        );
      }

      if (
        tag.length >
        CATALOGUE_CONFIG.MAX_REPLACEMENT_KEY_LENGTH
      ) {
        throw new Error(
          'Template tag is too long: ' +
          tag
        );
      }

      if (!allowedTags[tag]) {
        throw new Error(
          'Template text tag is not allowed by parameter_mapping.json ' +
          'or Performance_Curve.csv for the selected product: ' +
          tag
        );
      }

      const rawValue = replacements[key];

      if (
        rawValue !== null &&
        rawValue !== undefined &&
        typeof rawValue === 'object'
      ) {
        throw new Error(
          'Template replacement value must be text: ' +
          tag
        );
      }

      const value =
        rawValue === null ||
        rawValue === undefined
          ? ''
          : String(rawValue);

      if (
        value.length >
        CATALOGUE_CONFIG.MAX_REPLACEMENT_VALUE_LENGTH
      ) {
        throw new Error(
          'Template replacement value is too long: ' +
          tag
        );
      }

      totalCharacters +=
        tag.length +
        value.length;

      if (
        totalCharacters >
        CATALOGUE_CONFIG
          .MAX_REPLACEMENT_TOTAL_CHARACTERS
      ) {
        throw new Error(
          'Template replacement payload is too large.'
        );
      }

      normalized[tag] = value;
    });

    return normalized;
  }

  function validateParameterMappingDocument_(
    mapping
  ) {
    if (
      !mapping ||
      typeof mapping !== 'object' ||
      Array.isArray(mapping)
    ) {
      throw new Error(
        'parameter_mapping.json must contain a JSON object.'
      );
    }

    if (!Array.isArray(mapping.fields)) {
      throw new Error(
        'parameter_mapping.json must contain a "fields" array.'
      );
    }

    if (
      mapping.computedFields !== undefined &&
      !Array.isArray(mapping.computedFields)
    ) {
      throw new Error(
        '"computedFields" must be an array.'
      );
    }

    if (
      mapping.performanceCurves !== undefined &&
      !Array.isArray(mapping.performanceCurves)
    ) {
      throw new Error(
        '"performanceCurves" must be an array.'
      );
    }

    const imageMappings =
      collectImageMappings_(mapping);

    const expectedSources =
      Object.keys(
        CATALOGUE_CONFIG.GRAPHIC_FIELDS
      );

    expectedSources.forEach(function (source) {
      const expectedDescription =
        CATALOGUE_CONFIG
          .GRAPHIC_FIELDS[source]
          .imageDescription;

      const found =
        imageMappings.some(
          function (item) {
            return (
              item.source === source &&
              item.tag === expectedDescription
            );
          }
        );

      if (!found) {
        throw new Error(
          'Missing image mapping: ' +
          source +
          ' → ' +
          expectedDescription
        );
      }
    });
  }

  /**
   * Returns only text placeholders that may be supplied by the browser.
   * Image tags are excluded.
   */
  function collectAllowedTemplateTags_(mapping) {
    const allowed = {};

    const addFieldTags = function (field) {
      if (
        !field ||
        typeof field !== 'object'
      ) {
        return;
      }

      let tags = [];

      if (Array.isArray(field.tags)) {
        tags = tags.concat(field.tags);
      }

      if (
        field.tag !== undefined &&
        field.tag !== null
      ) {
        tags.push(field.tag);
      }

      tags.forEach(function (tag) {
        const normalized =
          String(tag || '').trim();

        if (
          normalized &&
          normalized.toUpperCase() !== 'N/A' &&
          !isImageTag_(normalized)
        ) {
          allowed[normalized] = true;
        }
      });
    };

    (mapping.fields || []).forEach(
      addFieldTags
    );

    (mapping.computedFields || []).forEach(
      addFieldTags
    );

    return allowed;
  }

  function collectImageMappings_(mapping) {
    const images = [];

    (mapping.fields || []).forEach(
      function (field) {
        if (
          !field ||
          typeof field !== 'object'
        ) {
          return;
        }

        let tags = [];

        if (Array.isArray(field.tags)) {
          tags = tags.concat(field.tags);
        }

        if (
          field.tag !== undefined &&
          field.tag !== null
        ) {
          tags.push(field.tag);
        }

        tags.forEach(function (tag) {
          const normalized =
            String(tag || '').trim();

          if (!isImageTag_(normalized)) {
            return;
          }

          images.push({
            source:
              String(field.source || '').trim(),
            tag: normalized
          });
        });
      }
    );

    return images;
  }

  function isImageTag_(tag) {
    return /^img_/i.test(
      String(tag || '').trim()
    );
  }

  function replaceDocumentText_(
    documentId,
    replacements
  ) {
    const requests =
      Object.keys(replacements).map(
        function (findText) {
          return {
            replaceAllText: {
              containsText: {
                text: findText,
                matchCase: true
              },
              replaceText:
                String(
                  replacements[findText] || ''
                )
            }
          };
        }
      );

    if (!requests.length) {
      return {
        totalOccurrences: 0,
        notFound: [],
        occurrencesByTag: {}
      };
    }

    const response =
      Docs.Documents.batchUpdate(
        { requests: requests },
        documentId
      );

    let totalOccurrences = 0;
    const notFound = [];
    const occurrencesByTag = {};

    (response.replies || []).forEach(
      function (reply, index) {
        const tag =
          requests[index]
            .replaceAllText
            .containsText
            .text;

        const changed =
          reply.replaceAllText &&
          reply.replaceAllText
            .occurrencesChanged
            ? reply.replaceAllText
                .occurrencesChanged
            : 0;

        occurrencesByTag[tag] =
          changed;

        totalOccurrences += changed;

        if (!changed) {
          notFound.push(tag);
        }
      }
    );

    return {
      totalOccurrences:
        totalOccurrences,
      notFound:
        notFound,
      occurrencesByTag:
        occurrencesByTag
    };
  }

  /**
   * Converts the template temporarily and returns all inline-image
   * descriptions visible after Google Docs import.
   */
  function inspectTemplateImageDescriptions_(
    resources
  ) {
    const webResources =
      resources || getRequiredWebResources_();

    let temporaryDocumentId = null;

    try {
      const templateBlob = DriveApp
        .getFileById(
          webResources.datasheetTemplate.id
        )
        .getBlob();

      const converted = Drive.Files.create({
        name:
          '_catalogue_image_description_test_' +
          Date.now(),
        mimeType:
          CATALOGUE_CONFIG.GOOGLE_DOC_MIME_TYPE
      }, templateBlob, {
        supportsAllDrives: true,
        fields: 'id,name,mimeType'
      });

      temporaryDocumentId = converted.id;

      const document =
        DocumentApp.openById(
          temporaryDocumentId
        );

      const descriptions =
        (document.getBody().getImages() || [])
          .map(function (image) {
            return {
              description:
                String(
                  image.getAltDescription() || ''
                ),
              title:
                String(
                  image.getAltTitle() || ''
                ),
              width: image.getWidth(),
              height: image.getHeight()
            };
          })
          .filter(function (item) {
            return item.description;
          });

      document.saveAndClose();

      const required =
        Object.keys(
          CATALOGUE_CONFIG.GRAPHIC_FIELDS
        ).map(function (source) {
          return CATALOGUE_CONFIG
            .GRAPHIC_FIELDS[source]
            .imageDescription;
        });

      const foundDescriptions =
        descriptions.map(function (item) {
          return item.description;
        });

      return {
        descriptions: descriptions,
        required: required,
        missing: required.filter(
          function (description) {
            return (
              foundDescriptions.indexOf(
                description
              ) === -1
            );
          }
        )
      };
    } finally {
      if (temporaryDocumentId) {
        deleteTemporaryDriveFile_(
          temporaryDocumentId
        );
      }
    }
  }

  function buildTemporaryDocumentName_(
    productRow
  ) {
    return [
      '_catalogue_datasheet_temp',
      safeFileNamePart_(productRow.ZZMODEL),
      safeFileNamePart_(productRow.MATNR),
      String(Date.now())
    ].filter(Boolean).join('_');
  }

  function buildPdfFileName_(productRow) {
    const parts = [
      safeFileNamePart_(productRow.ZZMODEL),
      safeFileNamePart_(productRow.MATNR),
      'Datasheet'
    ].filter(Boolean);

    return parts.join('_') + '.pdf';
  }

  function safeFileNamePart_(value) {
    return text_(value)
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function deleteTemporaryDriveFile_(fileId) {
    try {
      Drive.Files.remove(fileId);
      return;
    } catch (removeError) {
      console.warn(
        'Temporary file could not be permanently deleted: ' +
        removeError.message
      );
    }

    try {
      Drive.Files.update(
        { trashed: true },
        fileId,
        null,
        { supportsAllDrives: true }
      );
    } catch (trashError) {
      console.warn(
        'Temporary file could not be moved to Trash: ' +
        trashError.message
      );
    }
  }

  return Object.freeze({
    moduleName: 'DocxPdfService',
    moduleVersion: '7.6.6',

    generateProductDatasheetPdf_:
      generateProductDatasheetPdf_,
    validateReplacementMap_:
      validateReplacementMap_,
    validateParameterMappingDocument_:
      validateParameterMappingDocument_,
    collectAllowedTemplateTags_:
      collectAllowedTemplateTags_,
    collectImageMappings_:
      collectImageMappings_,
    inspectTemplateImageDescriptions_:
      inspectTemplateImageDescriptions_
  });
})

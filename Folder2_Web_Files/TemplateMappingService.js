(function (global) {
  'use strict';

  /**
   * Browser-side parameter mapping engine.
   *
   * This file is stored in WEB_FOLDER_ID and injected before app.js.
   */
  function validateMapping(mapping) {
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

    mapping.fields.forEach(function (field, index) {
      if (
        !field ||
        typeof field !== 'object' ||
        Array.isArray(field)
      ) {
        throw new Error(
          'Invalid fields entry at index ' + index + '.'
        );
      }

      if (!field.source) {
        throw new Error(
          'Missing "source" in fields entry at index ' +
          index + '.'
        );
      }

      if (
        !field.tag &&
        !Array.isArray(field.tags)
      ) {
        throw new Error(
          'Missing "tag" or "tags" in fields entry at index ' +
          index + '.'
        );
      }
    });

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

    return true;
  }

  /**
   * Builds the complete template tag-to-value object.
   *
   * @param {Object} context Product, rated-point and performance data.
   * @param {Object} mapping Parsed parameter_mapping.json.
   * @return {Object<string,string>}
   */
  function buildReplacementMap(context, mapping) {
    validateMapping(mapping);
    validateContext(context);

    const replacements = {};
    const blankValue =
      mapping.blankValue === undefined
        ? ''
        : String(mapping.blankValue);

    (mapping.fields || []).forEach(function (field) {
      const tags = mappingTags(field).filter(
        function (tag) {
          return !isImageTag(tag);
        }
      );
      if (!tags.length) return;

      const rawValue =
        context.productRow[field.source];

      const value = formatMappedValue(
        rawValue,
        field,
        blankValue
      );

      tags.forEach(function (tag) {
        replacements[tag] = value;
      });
    });

    (mapping.computedFields || []).forEach(
      function (field) {
        const tags = mappingTags(field).filter(
          function (tag) {
            return !isImageTag(tag);
          }
        );
        if (!tags.length) return;

        const value = computeMappedValue(
          field,
          context,
          blankValue
        );

        tags.forEach(function (tag) {
          replacements[tag] = value;
        });
      }
    );

    if (
      context.performanceCurveSource ===
        'Performance_Curve.csv'
    ) {
      addDynamicPerformanceCurveReplacements(
        replacements,
        context.performanceCurveReplacements
      );
    } else {
      // Backward compatibility only. Version 7.6.4 normally uses
      // Performance_Curve.csv according to specification section 9.2.
      (mapping.performanceCurves || []).forEach(
        function (curve) {
          addPerformanceCurveReplacements(
            replacements,
            curve,
            context.performanceRows,
            blankValue
          );
        }
      );
    }

    return replacements;
  }

  function validateContext(context) {
    if (
      !context ||
      typeof context !== 'object' ||
      Array.isArray(context)
    ) {
      throw new Error(
        'Product template context must be an object.'
      );
    }

    if (
      !context.productRow ||
      typeof context.productRow !== 'object'
    ) {
      throw new Error(
        'Product template context is missing productRow.'
      );
    }
  }

  function mappingTags(field) {
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

    return tags.map(function (tag) {
      return String(tag || '').trim();
    }).filter(function (tag) {
      return tag && tag.toUpperCase() !== 'N/A';
    });
  }

  function isImageTag(tag) {
    return /^img_/i.test(
      String(tag || '').trim()
    );
  }

  function getImageMappings(mapping) {
    validateMapping(mapping);

    const images = [];

    (mapping.fields || []).forEach(function (field) {
      mappingTags(field).forEach(function (tag) {
        if (!isImageTag(tag)) return;

        images.push({
          source: String(field.source || ''),
          tag: tag
        });
      });
    });

    return images;
  }

  function formatMappedValue(
    rawValue,
    field,
    blankValue
  ) {
    const value = text(rawValue);

    if (!value) {
      return field.blankValue === undefined
        ? blankValue
        : String(field.blankValue);
    }

    return String(field.prefix || '') +
      value +
      String(field.suffix || '');
  }

  function computeMappedValue(
    field,
    context,
    blankValue
  ) {
    switch (field.type) {
      case 'powerSupply':
        return formatPowerSupply(
          context.productRow
        ) || blankValue;

      case 'ratedPoint':
        return relatedRowValue(
          context.ratedPoints,
          field,
          blankValue
        );

      case 'literal':
        return field.value === undefined
          ? blankValue
          : String(field.value);

      default:
        throw new Error(
          'Unsupported computed field type: ' +
          field.type
        );
    }
  }

  function relatedRowValue(
    rows,
    field,
    blankValue
  ) {
    const index = Number.isFinite(
      Number(field.index)
    )
      ? Number(field.index)
      : 0;

    const row = (rows || [])[index];

    if (!row) return blankValue;

    return formatMappedValue(
      row[field.source],
      field,
      blankValue
    );
  }

  function addDynamicPerformanceCurveReplacements(
    replacements,
    dynamicValues
  ) {
    if (
      !dynamicValues ||
      typeof dynamicValues !== 'object' ||
      Array.isArray(dynamicValues)
    ) {
      return;
    }

    Object.keys(dynamicValues).forEach(
      function (tag) {
        const normalizedTag =
          String(tag || '').trim();

        if (!normalizedTag) {
          return;
        }

        const rawValue =
          dynamicValues[tag];

        replacements[normalizedTag] =
          rawValue === null ||
          rawValue === undefined
            ? ''
            : String(rawValue);
      }
    );
  }

  function addPerformanceCurveReplacements(
    replacements,
    curve,
    allRows,
    blankValue
  ) {
    const ambient = number(
      curve.ambientTemperatureC
    );

    const maxRows = Math.max(
      0,
      Number(curve.maxRows) || 0
    );

    const tags = curve.tags || {};

    if (ambient === null || !maxRows) {
      throw new Error(
        'Each performanceCurves entry requires ' +
        'ambientTemperatureC and maxRows.'
      );
    }

    const rows = (allRows || []).filter(
      function (row) {
        return number(
          row.AmbientTemperature_C
        ) === ambient;
      }
    ).slice(0, maxRows);

    for (
      let index = 0;
      index < maxRows;
      index += 1
    ) {
      const rowNumber = index + 1;
      const row = rows[index] || {};

      assignPerformanceTag(
        replacements,
        tags.evaporatingTemperature,
        rowNumber,
        row.EvaporatingTemperature_C,
        blankValue
      );

      assignPerformanceTag(
        replacements,
        tags.coolingCapacity,
        rowNumber,
        row.CoolingCapacity_W,
        blankValue
      );

      assignPerformanceTag(
        replacements,
        tags.efficiency,
        rowNumber,
        row.Efficiency_WW,
        blankValue
      );

      assignPerformanceTag(
        replacements,
        tags.powerConsumption,
        rowNumber,
        row.PowerConsumption_W,
        blankValue
      );
    }
  }

  function assignPerformanceTag(
    replacements,
    tagPattern,
    rowNumber,
    rawValue,
    blankValue
  ) {
    if (!tagPattern) return;

    const tag = String(tagPattern).replace(
      /\{row\}/g,
      String(rowNumber)
    );

    replacements[tag] =
      text(rawValue) || blankValue;
  }

  function formatPowerSupply(row) {
    const supply = text(
      row.CU_GENERAL_ENERGY_SUPPLY_1
    );

    const frequency = text(
      row.CU_GENERAL_FREQUENCY_1
    );

    return [
      supply ? supply + ' V' : '',
      frequency ? frequency + ' Hz' : ''
    ].filter(Boolean).join(' ');
  }

  function text(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return '';
    }

    const result = String(value).trim();
    if (!result) return '';

    const normalized = result.toLowerCase();

    if (
      normalized === 'null' ||
      normalized === 'undefined' ||
      normalized === 'n/a'
    ) {
      return '';
    }

    return result;
  }

  function number(value) {
    const stringValue = text(value);
    if (!stringValue) return null;

    const parsed = Number(
      stringValue.replace(/,/g, '.')
    );

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  global.TemplateMappingService = Object.freeze({
    version: '7.6.6',
    validateMapping: validateMapping,
    buildReplacementMap: buildReplacementMap,
    getImageMappings: getImageMappings
  });
})(window);

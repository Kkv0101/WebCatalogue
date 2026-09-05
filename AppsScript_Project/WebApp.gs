/**
 * Serves the catalogue UI from files stored in WEB_FOLDER_ID.
 *
 * TemplateMappingService.js is read from Drive and injected into the browser
 * before app.js.
 */
function doGet(e) {
  const resources = getRequiredWebResources_();

  const indexHtml = readDriveTextFileById_(
    resources.indexHtml.id
  );

  const styles = readDriveTextFileById_(
    resources.styles.id
  );

  const templateMappingScript = readDriveTextFileById_(
    resources.templateMappingScript.id
  );

  const appScript = readDriveTextFileById_(
    resources.appScript.id
  );

  const uiConfig = readDriveJsonFileById_(
    resources.uiConfig.id
  );

  const parameterMapping = readDriveJsonFileById_(
    resources.parameterMapping.id
  );

  validateParameterMappingDocument_(parameterMapping);

  const initialProduct =
    e &&
    e.parameter &&
    e.parameter.product
      ? String(e.parameter.product).trim()
      : '';

  const runtimePayload = {
    ui: uiConfig,
    initialProduct: initialProduct,
    applicationVersion: CATALOGUE_CONFIG.VERSION,
    parameterMapping: parameterMapping
  };

  const content = indexHtml
    .replace(
      '/*__FONT_STYLE__*/',
      optionalFontFaceCss_(resources.index)
    )
    .replace('/*__APP_STYLE__*/', styles)
    .replace(
      '/*__RUNTIME_CONFIG__*/',
      safeJsonForHtml_(runtimePayload)
    )
    .replace(
      '/*__TEMPLATE_MAPPING_SCRIPT__*/',
      templateMappingScript
    )
    .replace('/*__APP_SCRIPT__*/', appScript);

  return HtmlService
    .createHtmlOutput(content)
    .setTitle(
      uiConfig.appTitle ||
      'Product Catalogue'
    )
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );
}

function safeJsonForHtml_(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

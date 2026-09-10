// Run from the repository root: node tests/datasheet-standards.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const baseModule = { exports: {} };
new Function('require', 'module', fs.readFileSync('tests/rated-standards.cjs', 'utf8'))(require, baseModule);

function setup() {
  const repo = baseModule.exports.loadRepository();
  const definitions = [
    { id: 'rg', refrigerant: 'R-290', application: 'LBP', standard: 'EN13215_RG20', Ta: 32, Te: -35 },
    { id: 'sh', refrigerant: 'R-290', application: 'LBP', standard: 'EN13215_SH10', Ta: 25, Te: -25 }
  ].map((row, i) => ({ ...row, csvRowNumber: i + 2, tags: { Te: 'Te1-1', CC: 'CAP1-1', COP: 'COP1-1', CON: 'CON1-1' } }));
  repo.loadPerformanceCurveDefinition_ = () => ({ rows: definitions, allTags: ['Te1-1', 'CAP1-1', 'COP1-1', 'CON1-1', 'CAP2-1'] });
  return repo;
}

async function runTests() {
  baseModule.exports.runTests();
  const repo = setup();
  const rg = repo.getProductTemplateContext_('CODE1', 'EN13215_RG20');
  const sh = repo.getProductTemplateContext_('CODE1', 'EN13215_SH10');
  assert.equal(sh.ratedPoints[0].Standard, 'EN13215 SH10');
  assert.equal(sh.ratedPoints[0].RatedCapacity_W, '2023');
  assert.equal(sh.ratedPoints[0].RatedEfficiency_WW, '2.65');
  assert.equal(sh.ratedPoints[0].RatedPowerConsumption_W, '762');
  assert.equal(sh.performanceCurveRows.length, 1);
  assert.equal(sh.performanceCurveRows[0].id, 'sh');
  assert.equal(sh.performanceCurveDiagnostics.standard, 'EN13215_SH10');
  assert.equal(sh.performanceCurveReplacements['Te1-1'], '-25');
  assert.equal(sh.performanceCurveReplacements['CAP1-1'], '2025');
  assert.equal(sh.performanceCurveReplacements['CC1-1'], '2025');
  assert.equal(sh.performanceCurveReplacements['COP1-1'], '2.61');
  assert.equal(sh.performanceCurveReplacements['CON1-1'], '775');
  assert.equal(sh.performanceCurveReplacements['CAP2-1'], '--');
  assert.equal(rg.performanceCurveReplacements['CAP1-1'], '1026');
  assert.equal(repo.getProductTemplateContext_('CODE1').ratedPoint.standard, 'EN13215_RG20');
  assert.throws(() => repo.getProductTemplateContext_('CODE1', 'ASHRAE'), /Unsupported/);
  const missing = repo.getProductTemplateContext_('CODE3', 'EN13215_SH10');
  assert.equal(missing.ratedPoints[0].RatedCapacity_W, '--');
  assert.equal(missing.performanceCurveReplacements['CAP1-1'], '--');
  assert.ok(missing.performanceCurveDiagnostics.warnings.length);

  const mapping = JSON.parse(fs.readFileSync('Folder2_Web_Files/parameter_mapping.json', 'utf8'));
  const browser = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync('Folder2_Web_Files/TemplateMappingService.js', 'utf8'), browser);
  const replacements = browser.window.TemplateMappingService.buildReplacementMap(sh, mapping);
  assert.equal(replacements.Standard_name, 'EN13215 SH10');
  assert.equal(replacements.R_CAPACITY, '2023');
  assert.equal(replacements.R_COP, '2.65');
  assert.equal(replacements['CAP1-1'], '2025');

  const config = vm.runInContext('CATALOGUE_CONFIG', repo);
  let generated;
  const service = vm.runInNewContext(fs.readFileSync('Folder2_Web_Files/CatalogueService.js', 'utf8'))({
    CATALOGUE_CONFIG: config,
    getProductTemplateContext_: repo.getProductTemplateContext_,
    getRequiredWebResources_: () => ({ parameterMapping: { id: 'mapping' } }),
    readDriveJsonFileById_: () => mapping,
    validateReplacementMap_: values => values,
    generateProductDatasheetPdf_: (...args) => { generated = args; return {}; }
  });
  const result = service.generateProductDatasheetPdf('CODE1', {
    Standard_name: 'EN13215 RG20', R_CAPACITY: 'wrong', R_COP: 'wrong',
    'CAP1-1': 'wrong', R_CONSUMPTION: 'wrong', BOM: 'CODE1'
  }, 'EN13215_SH10');
  assert.equal(generated[1].Standard_name, 'EN13215 SH10');
  assert.equal(generated[1].R_CAPACITY, '2023');
  assert.equal(generated[1].R_COP, '2.65');
  assert.equal(generated[1].R_CONSUMPTION, '762');
  assert.equal(generated[1]['CAP1-1'], '2025');
  assert.equal(generated[1].BOM, 'CODE1');
  assert.equal(generated[4].standard, 'EN13215_SH10');
  assert.equal(result.standard, 'EN13215_SH10');
  assert.equal(service.getProductTemplateContext('CODE1', 'EN13215_SH10').ratedPoint.standard, 'EN13215_SH10');
  assert.throws(() => service.generateProductDatasheetPdf('CODE1', {}, 'ASHRAE'), /Unsupported/);
  service.generateProductDatasheetPdf('CODE1', {}, 'EN13215_RG20');
  assert.equal(generated[1].Standard_name, 'EN13215 RG20');
  assert.equal(generated[1].R_CAPACITY, '1026');

  // Verify the final DOCX/PDF layer receives the selection as well.
  const stop = new Error('context captured');
  let capturedStandard;
  const docxSource = fs.readFileSync('Folder2_Web_Files/DocxPdfService.js', 'utf8')
    .replace("moduleName: 'DocxPdfService',", "moduleName: 'DocxPdfService', testFileName: buildPdfFileName_,");
  const docx = vm.runInNewContext(docxSource)({
    CATALOGUE_CONFIG: config, text_: value => String(value || ''),
    getRuntimeConfiguration_: () => ({}),
    DriveApp: { getFileById: () => ({ getBlob: () => ({ getDataAsString: () => JSON.stringify(mapping) }) }) },
    getProductTemplateContext_: (code, standard) => { capturedStandard = standard; throw stop; }
  });
  assert.throws(() => docx.generateProductDatasheetPdf_('CODE1', {}, true,
    { parameterMapping: { id: 'mapping' } }, { standard: 'EN13215_SH10' }), error => error === stop);
  assert.equal(capturedStandard, 'EN13215_SH10');
  assert.equal(docx.testFileName({ ZZMODEL: 'UNEX1', MATNR: 'CODE1' }, 'EN13215_SH10'), 'UNEX1_CODE1_EN13215_SH10_Datasheet.pdf');
  let forwarded;
  const api = vm.createContext({ getServerModuleRuntime_: () => ({ catalogueService: {
    getProductTemplateContext: (...args) => forwarded = args,
    generateProductDatasheetPdf: (...args) => forwarded = args
  } }) });
  vm.runInContext(fs.readFileSync('AppsScript_Project/ServerApi.gs', 'utf8'), api);
  api.getProductTemplateContext('CODE1', 'EN13215_SH10');
  assert.equal(forwarded[1], 'EN13215_SH10');
  api.generateProductDatasheetPdf('CODE1', {}, 'EN13215_SH10');
  assert.equal(forwarded[2], 'EN13215_SH10');
  // Check the actual checked-in curve grids for each requested standard.
  const lines = fs.readFileSync('Folder2_Web_Files/Performance_Curve.csv', 'utf8').trim().split(/\r?\n/);
  const actualRows = lines.slice(1).map(line => {
    const c = line.split(';');
    return { id: c[0], refrigerant: c[1], standard: c[2], application: c[3], Ta: Number(c[4]), Te: Number(c[5]),
      tags: { Te: c[6], CC: c[7], COP: c[8], CON: c[9] } };
  });
  for (const standard of ['EN13215_RG20', 'EN13215_SH10']) {
    const curve = repo.buildDatasheetPerformanceCurveFromRows_(baseModule.exports.fixture().products[0],
      baseModule.exports.fixture().curveCoefficients, actualRows, [], standard);
    assert.ok(curve.rows.length > 0, 'Missing actual CSV definitions for ' + standard);
    assert.ok(curve.rows.every(row => row.standard === standard));
    assert.ok(curve.rows.every(row => row.status === 'ok'));
  }
  await checkBrowserRequests(repo, mapping);
  console.log('Datasheet standards: Rated Point, curve points, real mapping, server overrides, API/PDF forwarding and filenames passed.');
}

async function checkBrowserRequests(repo, mapping) {
  const requests = [];
  let deliverContext, loadingPage = '', openedUrl = '', popupCount = 0;
  const google = { script: { get run() {
    return {
      withSuccessHandler(callback) { this.success = callback; return this; },
      withFailureHandler(callback) { this.failure = callback; return this; },
      getProductTemplateContext(code, standard) {
        requests.push({ name: 'context', code, standard });
        deliverContext = () => this.success(repo.getProductTemplateContext_(code, standard));
      },
      generateProductDatasheetPdf(code, replacements, standard) {
        requests.push({ name: 'generate', code, standard, replacements });
        this.success({ base64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'), mimeType: 'application/pdf', warnings: [] });
      }
    };
  } } };
  const fakeElement = () => ({ textContent: '', classList: { add() {}, remove() {} } });
  const window = {
    APP_RUNTIME: { parameterMapping: mapping }, google, addEventListener() {}, setTimeout() {},
    atob: text => Buffer.from(text, 'base64').toString('binary'),
    open() { popupCount++; return {
      document: { open() {}, write(text) { loadingPage = text; }, close() {} },
      location: { replace(url) { openedUrl = url; } }
    }; }
  };
  const browser = vm.createContext({ window, google, document: { addEventListener() {} }, console,
    Blob: require('node:buffer').Blob, atob: text => Buffer.from(text, 'base64').toString('binary'),
    URL: { createObjectURL: () => 'blob:test-pdf', revokeObjectURL() {} }, fakeElement });
  vm.runInContext(fs.readFileSync('Folder2_Web_Files/TemplateMappingService.js', 'utf8'), browser);
  const app = fs.readFileSync('Folder2_Web_Files/app.js', 'utf8').replace(/\}\)\(\);\s*$/, `
    window.testPdf = { openProductInNewTab, setStandard: value => state.standard = value };
    el.loading = fakeElement(); el.loadingText = fakeElement(); el.toast = fakeElement();
  })();`);
  vm.runInContext(app, browser);
  for (const standard of ['EN13215_SH10', 'EN13215_RG20']) {
    window.testPdf.setStandard(standard);
    const pending = window.testPdf.openProductInNewTab('CODE1', 'UNEX1');
    assert.equal(popupCount, requests.filter(r => r.name === 'context').length);
    assert.ok(loadingPage.includes(standard.replace(/_/g, ' ')));
    window.testPdf.setStandard(standard === 'EN13215_SH10' ? 'EN13215_RG20' : 'EN13215_SH10');
    deliverContext();
    await pending;
    const request = requests[requests.length - 1];
    assert.equal(request.name, 'generate');
    assert.equal(request.standard, standard, 'Captured standard must survive a selection change while awaiting context');
    assert.equal(request.replacements.Standard_name, standard.replace(/_/g, ' '));
    assert.equal(request.replacements.R_CAPACITY, standard === 'EN13215_SH10' ? '2023' : '1026');
    assert.equal(openedUrl, 'blob:test-pdf', loadingPage);
  }
  console.log('Browser PDF request flow: both standards, mapping and selection-change race passed.');
}

module.exports = { setup, runTests };
if (require.main === module) runTests().catch(error => { console.error(error); process.exitCode = 1; });

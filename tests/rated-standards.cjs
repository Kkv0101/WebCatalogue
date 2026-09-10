// Run from the repository root: node tests/rated-standards.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function coefficients(standard, capacity, power, extra = {}) {
  const row = { PD_Config: 'A', Refrigerant: 'R-290', Standard: standard };
  for (const prefix of ['CC_', 'CON_', 'CURR_']) {
    for (const letter of 'ABCDEFGHIJ') row[prefix + letter] = 0;
  }
  return Object.assign(row, { CC_A: capacity, CON_A: power }, extra);
}

function fixture() {
  return {
    products: ['A', 'B', 'C'].map((config, i) => ({
      MATNR: 'CODE' + (i + 1), ZZMODEL: 'UNEX1', PD_Config: config,
      APPLICATION: 'LBP', CU_GENERAL_REFRIGERANT: 'R-290',
      CU_GENERAL_FREQUENCY_1: '50'
    })),
    curveCoefficients: [
      coefficients('EN13215_RG20', 99999, 1, { Refrigerant: 'R-134a' }),
      coefficients('EN13215_RG20', 1000, 500, { CC_B: 2, CC_C: 3, CON_B: 1, CON_C: 1 }),
      coefficients('EN13215 SH10', 2000, 800, { CC_B: 3, CC_C: 4, CON_B: 2, CON_C: 1 }),
      coefficients('EN13215_RG20', 1500, 500, { PD_Config: 'B' }),
      coefficients('EN13215_SH10', 900, 600, { PD_Config: 'B' }),
      coefficients('EN13215_RG20', 800, 400, { PD_Config: 'C' })
    ]
  };
}

function loadRepository(snapshot = fixture()) {
  const context = vm.createContext({ getDatabaseSnapshot_: () => snapshot });
  for (const file of ['Config.gs', 'ProductRepository.gs']) {
    vm.runInContext(fs.readFileSync('AppsScript_Project/' + file, 'utf8'), context, { filename: file });
  }
  return context;
}

function runTests() {
  const snapshot = fixture(), repo = loadRepository(snapshot), product = snapshot.products[0];
  const calculate = (standard, row = product, curves = snapshot.curveCoefficients) =>
    repo.calculateRatedPointPerformance_(row, curves, standard);
  const rg = calculate('EN13215_RG20'), sh = calculate('EN13215_SH10');
  assert.equal(rg.coolingCapacityW, 1026);
  assert.equal(rg.powerConsumptionW, 497);
  assert.ok(Math.abs(rg.copWW - 1026 / 497) < 0.000001);
  assert.equal(sh.coolingCapacityW, 2023);
  assert.equal(sh.powerConsumptionW, 762);
  assert.ok(Math.abs(sh.copWW - 2023 / 762) < 0.000001);
  assert.equal(sh.displayStandard, 'EN13215 SH10');
  assert.equal(calculate().standard, 'EN13215_RG20');
  assert.equal(calculate('en13215 sh10').coolingCapacityW, 2023);
  assert.throws(() => calculate('ASHRAE'), /Unsupported/);
  for (const application of ['M/HBP', 'HBP', 'MBP']) {
    const point = calculate('EN13215_SH10', { ...product, APPLICATION: application });
    assert.equal(point.evaporatingTemperatureC, -10);
    assert.equal(point.ambientTemperatureC, 32);
    assert.equal(point.coolingCapacityW, 2098);
    assert.equal(point.powerConsumptionW, 812);
  }
  assert.equal(sh.evaporatingTemperatureC, -35);
  const missing = calculate('EN13215_SH10', snapshot.products[2]);
  assert.equal(missing.standard, 'EN13215_SH10');
  assert.equal(missing.status, 'coefficient-row-not-found');
  assert.equal(missing.coolingCapacityW, null);
  assert.equal(missing.copWW, null);
  const invalid = coefficients('EN13215_SH10', 1000, 500);
  delete invalid.CC_J;
  assert.equal(calculate('EN13215_SH10', product, [invalid]).coolingCapacityW, null);
  const zeroPower = calculate('EN13215_SH10', product, [coefficients('EN13215_SH10', 1000, 0)]);
  assert.equal(zeroPower.coolingCapacityW, 1000);
  assert.equal(zeroPower.copWW, null);
  const polynomial = {};
  [...'ABCDEFGHIJ'].forEach((letter, i) => polynomial['CC_' + letter] = i + 1);
  assert.equal(repo.evaluatePerformancePolynomial_(polynomial, 'CC_', 2, 3), 682);
  const summaries = repo.listProductSummaries_();
  assert.equal(summaries.length, 3);
  assert.equal(summaries[0].ratedPointsByStandard.EN13215_RG20.coolingCapacityW, 1026);
  assert.equal(summaries[0].ratedPointsByStandard.EN13215_SH10.coolingCapacityW, 2023);
  assert.equal(summaries[1].ratedPointsByStandard.EN13215_SH10.coolingCapacityW, 900);
  assert.equal(summaries[2].ratedPointsByStandard.EN13215_SH10.coolingCapacityW, null);
  assert.equal(summaries[0].ratedPoint, summaries[0].ratedPointsByStandard.EN13215_RG20);
  assert.equal(summaries[0].performance, summaries[0].ratedPoint);
  console.log('Rated standards: coefficient selection, polynomial, temperatures, COP, missing data and bootstrap checks passed.');
}

module.exports = { fixture, loadRepository, runTests };
if (require.main === module) runTests();

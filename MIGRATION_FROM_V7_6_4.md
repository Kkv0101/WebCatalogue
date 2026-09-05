# Migration from Version 7.6.4 to Version 7.6.5

The functional fix is in:

```text
AppsScript_Project/ProductRepository.gs
AppsScript_Project/Config.gs
```

The package also updates module version metadata.

After replacing the files and redeploying the Apps Script web app, run:

```javascript
runRefreshCatalogueCache();
runPerformanceCurveFileTest();
```

A successful result should contain something similar to:

```text
delimiter: semicolon (;)
headers:
  id
  refrigerant
  standard
  application
  ta_val
  te_val
  te
  cc
  cop
  con
rowCount: > 0
```

Then test the selected product with a wrapper:

```javascript
function testUNEU2155U() {
  return runPerformanceCurveTest(
    '562KAE004AA'
  );
}
```

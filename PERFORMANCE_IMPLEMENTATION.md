# Performance Calculation — Version 7.6.4

## Polynomial

For Cooling Capacity, Power Consumption and Current Consumption:

```text
Parameter =
    coef_A
  + Te * coef_B
  + Ta * coef_C
  + Te * Ta * coef_D
  + Te² * coef_E
  + Ta² * coef_F
  + Te² * Ta * coef_G
  + Te * Ta² * coef_H
  + Te³ * coef_I
  + Ta³ * coef_J
```

Coefficient worksheet:

```text
Curve Coefficients
```

## Rated Point

Version 7.6.4 retains the Version 7.6.3 Rated Point implementation.

## Detailed datasheet performance

Source:

```text
WEB_FOLDER_ID/Performance_Curve.csv
```

Required columns:

```text
id
refrigerant
standard
Application
Ta_val
Te_val
Te
CC
COP
CON
```

For the selected product, the application filters rows by:

```text
product.CU_GENERAL_REFRIGERANT = CSV.refrigerant
EN13215 RG20                   = CSV.standard
product.APPLICATION            = CSV.Application
```

Refrigerant and Standard matching normalize spaces, hyphens and underscores.

For every selected row:

```text
Te tag  <- Te_val
CC tag  <- calculated Cooling Capacity
COP tag <- Cooling Capacity / Power Consumption
CON tag <- calculated Power Consumption
```

Capacity and Power Consumption are formatted as whole Watts. COP is formatted
to two decimal places with trailing zeroes removed.

The current `parameter_mapping.json.performanceCurves` section is not used for
Version 7.6.4 detailed performance when the CSV context is present.

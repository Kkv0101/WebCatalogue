# Product Catalogue v7.6.6 — Graphic Replacement Specification

## 1. Objective

Replace selected images inside the DOCX datasheet template using graphic
filenames stored in the product database.

## 2. Mapping

`parameter_mapping.json` contains these field mappings:

```json
{ "source": "DRAWING_3d", "tag": "img_3D" }
{ "source": "EXTERNAL_DIMENSIONS", "tag": "img_Dimensions" }
{ "source": "ELECTRICAL_DIAGRAM", "tag": "img_Wiring" }
{ "source": "ENVELOPE", "tag": "img_Envelope" }
```

Tags beginning with `img_` are image mappings and are excluded from browser
text replacement.

## 3. Template requirements

The corresponding inline pictures in `DatasheetTemplate.docx` must use these
exact, case-sensitive Image Description values:

- `img_3D`
- `img_Dimensions`
- `img_Wiring`
- `img_Envelope`

## 4. Graphic folders

The source-to-folder mapping is:

| Source | Runtime folder |
|---|---|
| `DRAWING_3d` | `GRAPHIC_3D_FOLDER_ID` |
| `EXTERNAL_DIMENSIONS` | `GRAPHIC_DIMENSIONS_FOLDER_ID` |
| `ELECTRICAL_DIAGRAM` | `GRAPHIC_ELECTRICAL_FOLDER_ID` |
| `ENVELOPE` | `GRAPHIC_ENVELOPE_FOLDER_ID` |

If a dedicated folder property is absent, the application uses
`DATA_FOLDER_ID`.

## 5. File resolution

Accepted extensions:

- `.png`
- `.jpg`
- `.jpeg`

Resolution rules:

1. case-insensitive exact filename;
2. case-insensitive filename stem;
3. PNG preference when the database omits the extension.

## 6. Replacement process

1. Convert `DatasheetTemplate.docx` to a temporary Google Document.
2. Replace text placeholders using the Docs API.
3. Open the temporary document through `DocumentApp`.
4. Enumerate inline images and index them by alternate description.
5. Resolve the database graphic file in the configured Shared Drive folder.
6. Insert the new image at the same paragraph child index.
7. Fit the image inside the original placeholder without changing its aspect
   ratio. For palceholder "img_3D" set height at 6cm, for width keep origial picture ascpet ratio 
8. Copy the Image Description, alternate title and link.
9. Remove the original placeholder image.
10. Save the temporary document and export it to PDF.
11. Delete the temporary Google Document.

## 7. Failure behavior

A missing value, missing file, unsupported format, missing description or
replacement error does not stop PDF generation.

The original template picture remains and a warning is returned.

## 8. Diagnostics

`runTemplateImageDescriptionTest()` temporarily converts the template and
reports the descriptions that survived Google Docs import.

`runTemplateGenerationTest()` reports:

- `imageReplacementCount`
- `imageReplacements`
- `imageDescriptionsFound`
- `warnings`

## 9. Perfromance Data calculation

Web katalog zobrazuje na hlavnje stranke aj v datasheete Perfromance Data
Kazdy produkt ma nasledovne Performance Data
1. Cooling Capacity
2. Power Consumption
3. Current Consumption
4. COP

Kazdy parameter 1.- 3. sa vypocitava na zaklade 2 vstupnych hodnot a polynomu (matematickej funkcie) s 10 koefientami, oznacenych A az J.
Vstupne hodnoty su:
1. Ta(ambient temperature)
2. Te (Evaporating temperature)

Hodnota COP sa vypocita ako Cooling Capacity / Power Consumption

Koeficienty pre polynom su oznacene naseldovne
1. CC_J az CC_A set 10 koeficientov pre vypocet  Cooling Capacity
2. CON_J az CON_A set 10 koeficientov pre vypocet Power Consumption
3. CURR_J az CURR_A set 10 koeficientov pre vypocet Current Consumption

Koeficienty su ulozene v Databaze produktov DATABASE_FILE_ID v harku "Curve Coefficients"
Popis stlpcov tabulky "Curve Coefficients"
1. PD_Config: primary key, pre kazdy produkt
2. CC_J az CC_A: koeficienty
3. CON_J az CON_A: koeficienty
4. CURR_J az CURR_A: koeficienty

Polynom pre matematicky vypocet jednotlivych parametrov je nasedujuci
Parameter = coef_A + 
			Te * coef_B + 
			Ta * coef_C +
			Te * Ta * coef_D +
			Te * Te * coef_E +
			Ta * Ta * coef_F +
			Te * Te * Ta * coef_G +
			Te * Ta * Ta * coef_H +
			Te * Te * Te * coef_I +
			Ta * Ta * Ta * coef_J

			
Vztah medzi tabulkami "CDU Products Data" a  "Curve Coefficients" je cez primary key "PD_Config"
Vztah je 1:N (1 zaznam v "CDU Products Data" ma N zaznamov v "Curve Coefficients"). Rozdiel je potom v nasledujucich parametroch:
1. Refrigerant
2. Standard
	
Kazdy produkt moze mat reprezentovane vykonove data podla roznych noriem (EN13215, ASHRAE atd), specifikovanych parametrom Standard.
v Harku StandardTemp su uvedene typicke teploty tzv Rated Points v ktorych su uvadzane vykony pre jednotlive Standards. tabulka obsahuje tieto stlpce:
1. Standard		- norma, je identicky s "Curve Coefficients".Standard
2. Application	- typ aplikacie, je identicky s "CDU Products Data".APPLICATION
3. T_coef_input	- jednotka pre teplotu Celsius alebo Farenheit, berieme do uvahy len C (= Celsius)
4. Tevap		- hodnota Te pre Rated Point			
5. Tamb			- hodnota Ta pre rated Point

## 9.1 Perfromance Data - Rated Point

Pre "Rated Point" sa priradia Ta a Te podla "Application" nasledovne
1. If Application = "M/HBP", "HBP", "MBP" ==> Te=-10 Ta=32
4. If Application = "LBP" ==> Te=-35 Ta=32

Pre Standard = "EN13215_RG20" sa potom dopocitaju podla Ta, Te a Coefficents pre polynom nasledovne hodnoty
1. Cooling Capacity
2. Power Consumption
3. COP

Na hlavnej stranke web catalogu ku kazdemu produktu sa vypocita a zobrazi hodnota "Rated Point" ktora zahrna "Cooling Capacity" a "COP" pre standardy "EN13215_RG20".
Kzady produkt bude mat 2 linky, pre 2 datasheety. Kazdy datasheet  v kazdPre kazdy standard sa vygeneruje datasheet samostatne

Do DatasheetTemplatu  sa pre doplnia tieto vypocitane parametre pre Rated point a nasledne sa nahradia jednotlive tag podla parameter_mapping.json
1. "RatedCapacity_W" ==> Cooling Capacity
2. "RatedEfficiency_WW" ==> COP
3. "RatedPowerConsumption_W" ==> Power Consumption
4. "RatedAmbientTemperature_C" ==> Ta
5. "RatedEvaporatingTemperature_C" ==> Te 
6. "Standard" ==> "EN13215 RG20"


## 9.2 Perfromance Data - Presentation on Datasheet

V datasheete su zobrazene detailne Perfromance Data v tabulke, pre rozne kombinacie Ta a Te
Kombinacie Te a Ta su v tabulke Performance_Curve.csv - je ulozeny vo WEB_FOLDER_ID
Struktura tabulky Performance_Curve.csv a popis stlpcov
id - identifikator zaznamu
refrigerant - refrigerant
standard - standard, "EN13215_RG20"
Application - application "LBP", "M/HBP" alebo "HBP"
Ta_val - hodnota Ta
Te_val - hodnota Te
Te - tag v datasheete pre hodnotu Te
CC - tag v datasheete pre vypocitanu hodnotu Cooling Capacity
COP - tag v datasheete pre vypocitanu hodnotu COP
CON - tag v datasheete pre vypocitanu hodnotu Power Consumption

Pre dany product sa z tabulky Performance_Curve.csv vyberu pre dany "Refreigerant" "Standard" a "Application" kombinacie "Ta_val" a "Te_val". Pre tieto hodnoty sa na zaklade coeficientov a plynomu vypocitaju hodnoty "Cooling Capacity" "Power Consumption" a "COP". vypocitamne hodnoty sa podla mazbu tag pre CC, COP a CON nahradia tagy v datasheete vypocitanymi hodnotami

Priklad:
refrigerant: R-290
standard: EN13215_RG20
Application: M/HBP
Aplikacia vyberie prvu hodnotu Te: Te1-1
Pre tento zaznam je Te_val=-10 Ta_val=25, pre tuto kombinaciu Te a Ta aplikacia vypocita Perfromance Data a v datasheete nahradi nahradi tag nasledovne
Do DatasheetTemplatu sa nahradia jednotlive tag:
1. "CC1-1" ==> Cooling Capacity
2. "CON1-1" ==> Power Consumption
3. "COP1-1" ==> Cooling Capacity / Power Consumption
Tento postup opakuje pre vsetky Te1-1, Te2-1...tags v datasheete

Implementation compatibility note:
Current DatasheetTemplate.docx uses CAPx-y tags for Cooling Capacity. The
application therefore accepts both CCx-y and CAPx-y as equivalent Cooling
Capacity template tags.

## 10 Initial screen layout
Uvadona obrazovka obsahuje parametre v stlpcoch a v iradkoch su potom zoradene jednotlive produkty.
Zoznam paramterov - v stlpcoch
1. Model
2. Engineering Code
3. Refrigerant
4. Frequency
5. Power Supply
6. Application
7. Standard
9. Capacity
10. Efficiency
11. Motor
12. Datasheet

Ak "Model" obsahuje viacero "Engineering code" (teda roznych verzii produktov) zgroup ich pod jeden model. Podobne ako Merge bunky v exceli. 
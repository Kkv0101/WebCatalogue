# Changelog — Version 7.6.5

Fixed parsing of `Performance_Curve.csv`.

Version 7.6.4 used:

```javascript
Utilities.parseCsv(csvText)
```

which assumes comma-separated data. CSV files exported by Excel with regional
European settings are commonly semicolon-separated, causing the whole header
line to be interpreted as one field and producing the error that all columns
are missing.

Version 7.6.5 automatically detects and supports:

- comma `,`
- semicolon `;`
- tab
- pipe `|`

It also supports the optional Excel first line:

```text
sep=;
```

`runPerformanceCurveFileTest()` now additionally reports:

- detected delimiter;
- parsed headers;
- row count;
- tag count;
- first parsed rows.

No change was made to the section 9 polynomial or the section 9.2
performance calculation logic.

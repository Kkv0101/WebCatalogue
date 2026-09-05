# Product Catalogue Development Instructions

## Project purpose

This project is a web-based Product Catalogue for an internal Google Workspace team.

The application is built using Google Apps Script together with HTML, CSS and JavaScript files stored on Shared Google Drive.

## Architecture rules

The Google Apps Script project may contain only:

- `.gs` files
- `appsscript.json`

Do not add HTML, CSS or JavaScript files into the Apps Script project.

Frontend files and server-side JavaScript modules are stored in Shared Google Drive.

Project structure:

```text
AppsScript_Project/
- Google Apps Script source files
- appsscript.json

WEB_Files/
- index.html
- CSS files
- JavaScript files
- JSON configuration files
- DatasheetTemplate.docx
- Performance_Curve.csv
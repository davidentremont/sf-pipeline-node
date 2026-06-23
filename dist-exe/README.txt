SF Async Data Pipeline
======================

Usage
─────
  sf-pipeline.exe

Then open http://localhost:8080 in a browser.

To use a different port:
  set PORT=9000 && sf-pipeline.exe        (cmd.exe)
  $env:PORT=9000; .\sf-pipeline.exe      (PowerShell)

Directories  (relative to where the exe is run from)
─────────────────────────────────────────────────────
  data\      SQLite database (created automatically).

Environment variables
─────────────────────
  PORT=8080                        HTTP / WebSocket port
  PROGRESS_DB=data\pipeline.db     Path to SQLite database file

Salesforce OAuth setup
──────────────────────
In your Salesforce Connected App, add this Callback URL:
  http://localhost:8080/api/oauth/callback
(adjust the port if you changed PORT)

---
name: Node 22 runtime and ET-dependent snapshots
description: Workspace needs Node 22 and TZ=America/New_York for the committed test snapshots
---
Runtime is nodejs-22 (t.assert.snapshot needs Node 22; yahoo-finance2 requires >=22). Committed snapshot files in client/src/lib/__tests__ embed Eastern-time strings; TZ=America/New_York is set as a shared repl env var so npm test passes. If snapshot tests fail with times off by hours, check TZ before suspecting code.

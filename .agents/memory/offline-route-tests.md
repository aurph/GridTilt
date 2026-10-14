---
name: Offline route test isolation
description: Workspace database settings and recorded daily data can contaminate route tests.
---
Offline route tests must isolate database selection and the calendar day from workspace state.

**Why:** A workspace database URL selected a real store in an auth-only test, while an existing daily GPU snapshot correctly suppressed a sweep that another test expected to run.

**How to apply:** Use a test-owned store or remove the database setting inside the isolated test process. Use a controlled clock for daily refresh tests, stub provider calls, and never delete recorded data to make a test pass.

# License for datacenter-sites.json

`datacenter-sites.json` is a database derived from the **IM3 Open Source Data Center Atlas** (Pacific Northwest National Laboratory), whose facility locations come from **OpenStreetMap**.

- Source: Mongird, K., Thurber, T., Vernon, C., Burleyson, C., Akdemir, K. Z., & Rice, J. (2026). IM3 Open Source Data Center Atlas (v2026.11.02) [Data set]. MSD-LIVE Data Repository. https://doi.org/10.57931/17054299
- Upstream: © OpenStreetMap contributors. https://www.openstreetmap.org/copyright

Both are made available under the **Open Database License (ODbL) 1.0**: https://opendatacommons.org/licenses/odbl/1-0/

This file is offered under the same license. The rest of this repository is under its own license (see `LICENSE` at the repository root); that license does not apply to this file.

If you reuse this file:

1. Keep it under the ODbL 1.0 and keep this notice with it.
2. Credit "© OpenStreetMap contributors" and the IM3 Open Source Data Center Atlas wherever the data is shown.
3. If you publish a database adapted from it, publish that database under the ODbL as well.

What GridTilt changed: `scripts/ingest-dc-sites.ts` keeps each feature's location, name and operator, drops features outside the fifty states and DC, and folds overlapping features into one site (the method is written in the file's `method` list). Nothing was added that the source does not carry.

Where it is shown: the map on gridtilt.com credits "© OpenStreetMap contributors" and the atlas in the map's attribution line and in the source line under the map.

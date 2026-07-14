# Frontier model relay methodology

Last verified: July 14, 2026

## What the relay measures

The release view is a chronology, not a score chart. Horizontal position is the public release date and vertical position is the model lab. A model appears when it was a flagship, moved the frontier, shifted the product paradigm, or represented a frontier-relevant open-weight release.

The benchmark view uses native benchmark values. It does not create an intelligence index, normalize unrelated tests, interpolate missing scores, or fit a trend line.

## Release evidence

Release dates prefer, in order:

1. First-party lab announcements or model cards.
2. First-party papers and official model repositories.
3. An authoritative distribution model card when the lab page is unavailable.

Each registry source records its publisher, title, URL, publication date, access date, and the part of the source used. Preview dates and general-availability dates are not silently substituted for one another. The release status shown in a model receipt identifies which event the timeline uses.

## Benchmark comparability

Every score record includes:

- benchmark and native unit;
- exact comparability key;
- evaluation setting;
- provenance class;
- cited source.

Two points connect only when the benchmark ID and comparability key are identical. A shared benchmark name is not enough. Tool access, test version, prompting, sampling, pass count, reasoning effort, and harness can each split results into different configurations.

Provenance is classified as lab-reported, benchmark-owner, or independent. This describes who supplied the number, not whether the result is correct. Lab comparison tables can include competitor values; those values retain the table as their evidence source.

## Important limitations

- Inclusion is editorial and is not a claim that every listed release was the world's best model on its release day.
- A missing score means the ledger does not yet have a settings-complete comparable value, not that the model failed the benchmark.
- Context windows are recorded only when a stable first-party value is available for the named release. Unknown values stay undisclosed.
- Lab-reported evaluation numbers may use different infrastructure or harness implementations even when the visible benchmark version matches.
- Rapid model aliases, silent snapshots, and regional availability changes are omitted unless they constitute a meaningful public frontier release.

## Updating the registry

Edit `server/data/frontier-models.json`, add a resolvable source for every new release or benchmark value, and run the frontier registry and transform tests. Do not add an estimated benchmark score. When an evaluation setup changes, create a new comparability key instead of extending the old series.

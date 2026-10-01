# Subscriber storage: setup, first migration, backup and restore

Procedure only. No addresses, exports or credentials belong in this repository.

## What the code does

- Subscribers live in Postgres when `DATABASE_URL` is set (`server/subscriber-store.ts`): one row per address with a state (`active`, `unsubscribed`, `bounced`, `complained`), plus a suppression table of email hashes that is never cleared.
- A success means the write reached the database. If the database is down, a signup answers 503 "Signups are unavailable right now" and an unsubscribe link shows "Not recorded yet". Neither shows success, and there is no local-file fallback in production.
- Production without `DATABASE_URL` answers every signup 503. The local JSON file (`server/data/subscribers.json`, ignored by version control) is for development and tests only.
- Unsubscribe links in emails already sent keep working: the token derivation in `server/routes.ts` is unchanged.
- An opt-out, bounce, complaint or admin deletion is permanent for the form: the same address signing up again gets "taken off the list earlier", not a new subscription. Admin deletion (`DELETE /api/admin/subscribers/:email`) removes the record and keeps only the hash.
- Only active addresses with a recorded signup date are sendable. A legacy row without a date is stored but never sent to.
- Nothing is imported at boot. A legacy list is imported only by the operator with `scripts/subscribers.ts`, once per import ID, and an import never revives a suppressed address.
- Remote connections verify TLS certificates. A `DATABASE_URL` with `sslmode=disable`, `allow`, `prefer` or `no-verify`, or `uselibpqcompat=true` without `sslmode=verify-full`, is refused at boot (signups then answer 503, and the log says why).

## One-time setup

1. Create a GridTilt-only Neon project and database. Copy its connection string, preferably with `sslmode=verify-full` (`require` also verifies under the current `pg` 8).
2. Before adding the secret, check Replit's Secrets for an existing `DATABASE_URL`. The `.replit` file enables a `postgresql-16` module that may have provisioned one. The server logs the host it uses at boot (`[subscribers] Postgres at <host>/<database>`, never the password), so the first deploy confirms which database is in use.
3. Set `DATABASE_URL` in Replit Secrets so the deployment can read it.

## First migration of the live list

The running production keeps accepting signups into its ephemeral file until the new build replaces it, and that file is lost on redeploy. Order matters.

1. Export the live list from the current production to a private, owner-only file outside this repository. Do not print it to a terminal or paste it anywhere:

   ```sh
   curl -sS -H "x-admin-key: <admin key>" https://gridtilt.com/api/admin/subscribers -o ~/Private/gridtilt-subscribers-live-YYYY-MM-DD.json
   chmod 600 ~/Private/gridtilt-subscribers-live-YYYY-MM-DD.json
   ```

2. See what an import would do. This prints counts and a checksum only, and needs no database:

   ```sh
   npx tsx scripts/subscribers.ts import-legacy ~/Private/gridtilt-subscribers-live-YYYY-MM-DD.json --dry-run
   ```

3. Import into the new database (default import ID `import-subscribers-json-v1`):

   ```sh
   DATABASE_URL='<neon url>' npx tsx scripts/subscribers.ts import-legacy ~/Private/gridtilt-subscribers-live-YYYY-MM-DD.json
   ```

4. Merge the change, pull main into the Replit workspace, and redeploy.
5. Signups that reached the old deployment between steps 1 and 4: export once more from the old deployment just before redeploying, then import with a new, explicit ID. Present and suppressed addresses are skipped, so nothing is revived or duplicated:

   ```sh
   DATABASE_URL='<neon url>' npx tsx scripts/subscribers.ts import-legacy <second export> --id import-live-YYYY-MM-DD-b
   ```

6. Check `GET /api/admin/subscribers` (admin key): `count` and `byState` should match the dry-run's addresses. Compare counts, not addresses.

## Backups

```sh
DATABASE_URL='<neon url>' npx tsx scripts/subscribers.ts export ~/Private/gridtilt-subscribers-YYYY-MM-DD.json
```

- The dump holds all three tables (subscribers with their states, suppressions, import claims), so a restore keeps every opt-out.
- The script writes owner-only, never overwrites a file, and refuses paths inside this repository or any `evidence` folder. Keep dumps in an access-restricted location, never in git, chat, build artifacts or the audit evidence folder.
- The printed summary (counts and a checksum) is safe to paste into a report; it contains no address.
- Neon also keeps point-in-time history; the retention window depends on the plan.

## Restore (into an isolated database first)

1. Create an empty Neon branch or database.
2. Restore. The script refuses a database that already has rows, loads everything in one transaction, then compares the restored contents with the dump by checksum:

   ```sh
   DATABASE_URL='<isolated url>' npx tsx scripts/subscribers.ts restore ~/Private/gridtilt-subscribers-YYYY-MM-DD.json
   ```

3. Point a local server at it (`DATABASE_URL='<isolated url>' npm run dev`) and check `/api/admin/subscribers`: counts and states match, and an opted-out address still gets "taken off the list earlier" from the form.
4. Only then point production's `DATABASE_URL` at it, if that is the goal.

## Rolling back the code

Redeploying a build from before this change brings back the JSON file on ephemeral disk. That build cannot see Postgres, so it has no record of opt-outs made since. Do not send a newsletter from a rolled-back build. Export first, and treat the export as the record.

## What has and has not been verified

- Verified with tests against pg-mem (an in-memory Postgres), in `npm test`: the import claim (concurrent and repeated), opt-out idempotency, suppression over imports, top-up imports, the schema retry after a failed first connection, no false success on database failure (HTTP tests), dump, restore and restart with states and suppressions intact, and the TLS refusal rules against `pg`'s own connection-string parser.
- Verified once, 2026-10-01, against a real local PostgreSQL 18 server (embedded, throwaway, fake addresses): the opt-in suite in `server/__tests__/subscriber-store.test.ts` (separate connection pools racing on schema setup, the import claim, signups, and an opt-out against a stale import), and an end-to-end run of every `scripts/subscribers.ts` command, including the refusals (repeat import, overwrite, a path inside the repository, restore into a non-empty database, a dump given to import-legacy).
- To rerun the real-server suite: set `TEST_DATABASE_URL` to an EMPTY throwaway database (a Neon branch works) and run that test file. It refuses a database that already has subscriber tables and drops only the tables it created. Never point it at production contacts.
- Not yet verified: TLS against Neon itself (the local server had no TLS).
- Not yet done: the production export, import and redeploy above. They need the owner's access and a decision on timing.

# Family Legacy Google Sheets schema

Google Sheets becomes the durable source of truth after the Apps Script in
`apps-script/Code.gs` is deployed. The static `data/family-legacy-data.js` file
remains the seed and offline fallback.

## Tabs

The script creates these tabs automatically:

| Tab | Columns |
| --- | --- |
| Persons | `id`, `record_json`, `updated_at` |
| Branches | `id`, `record_json`, `updated_at` |
| Events | `id`, `record_json`, `updated_at` |
| Stories | `id`, `record_json`, `updated_at` |
| Media | `id`, `record_json`, `updated_at` |
| Locations | `id`, `record_json`, `updated_at` |
| Sources | `id`, `record_json`, `updated_at` |
| PendingSubmissions | `id`, `submission_type`, `target_person_id`, `branch_ids_json`, `submitted_by`, `submitted_email`, `status`, `payload_json`, `created_at`, `reviewed_at` |
| Settings | `key`, `value_json`, `updated_at` |

`record_json` deliberately stores each complete record as JSON. This preserves
nested relationships, person lists, dates, tags, source arrays, and future
fields exactly without continually restructuring spreadsheet columns.

The Settings tab stores:

- `meta`
- `settings`

## API

- `GET ?action=ping`
- `GET ?action=getAll`
- `POST {"action":"saveRecord","recordType":"persons","record":{...}}`
- `POST {"action":"deleteRecord","recordType":"persons","id":"..."}`
- `POST {"action":"submitContribution", ...}`
- `POST {"action":"approveSubmission","id":"..."}`
- `POST {"action":"rejectSubmission","id":"..."}`
- `POST {"action":"seedFromInitialData","dataset":{...}}`

The web app must be deployed as **Execute as: Me** and **Who has access:
Anyone**. Apps Script web apps return through a Google-hosted redirect. The
front end uses ordinary `fetch()` for readable GET and POST responses. Writes
use `Content-Type: text/plain;charset=utf-8`, which avoids a CORS preflight.

Until the replacement script is deployed, the site detects the old intake-only
response, runs from local seed data, and keeps sending public contributions to
the legacy endpoint with `no-cors`. Admin edits cannot persist centrally in
that compatibility mode.

## One-time bootstrap

1. Open the existing Apps Script project behind the deployed URL.
2. Replace its code with `apps-script/Code.gs`.
3. Deploy a new version of the existing web app, preserving the `/exec` URL.
4. Open the Family Legacy site as Super Admin.
5. If the Sheet is empty, use **Edit Data → Seed Google Sheet from local data**.

The seed endpoint refuses to overwrite an initialized workbook unless the
request includes `force: true`. The UI intentionally does not force overwrite.

## Contributor review

Public contribution forms only create rows in `PendingSubmissions`.

- `person`: identifying information only; relationships are always empty.
- `note`: additive memory/photo link associated with `target_person_id`.
- `event` and `story`: complete proposed records awaiting review.

Approving a person creates a Persons record with empty relationships. Approving
a note creates a new Story linked to the target person; it never overwrites
their profile. Event/story approvals create their corresponding records.

## Important limitation

This is a public Apps Script API with no real server-side identity. The existing
client-side admin passwords and roles are deterrents, not security. Anyone who
discovers the endpoint can inspect requests and potentially call it. Real
privacy requires authenticated users and server-side authorization.
# Relationship model upgrade

The workbook keeps one lossless `record_json` cell per record. Two additional tabs, `Unions` and `Households`, store optional records using the same `id | record_json | updated_at` layout. Rich parent, partner, evidence, branch-membership, source, privacy, and connection objects remain inside each record JSON, so legacy string arrays are never discarded during sync. This is the safest backward-compatible strategy for the existing deployed workbook; a future reporting workbook may project these objects into normalized relationship tabs.

Schema version 2 adds idempotent normalized projections: `ParentRelationships`, `PartnerRelationships`, `UnionChildren`, `HouseholdMembers`, `BranchConnections`, and `BranchMemberships`. JSON tabs remain authoritative and are never deleted by migration. Use `previewRelationshipMigration()`, `runRelationshipMigration()`, and `verifyRelationshipMigration()` as documented in `ADMIN-GENEALOGY-GUIDE.md`.

Children attach to individual people in `person.relationships.parents`. A union's `child_ids` contains only children explicitly associated with that union and never grants parent status. `meta.home_branch_id` is the landing anchor; `meta.root_branch_ids` contains zero or more earliest-known lines.

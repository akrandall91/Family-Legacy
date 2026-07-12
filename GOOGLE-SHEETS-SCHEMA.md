# Google Sheets schema v4

The production workbook uses `flat-normalized-authoritative` storage. Ordinary administrators edit visible columns and dedicated link rows; no operational field is authoritative only in JSON.

## Flat entity sheets

- `People`: identity, names, vital dates, biography, confidence, primary branch, and privacy.
- `BranchesFlat`: branch identity, type, history, dates, color, media, and privacy.
- `EventsFlat`, `StoriesFlat`, `MediaFlat`, `LocationsFlat`, and `SourcesFlat`: one visible column per operational field.
- `UnionsFlat` and `HouseholdsFlat`: metadata only. Partners, children, and members live in link sheets.
- `SettingsFlat`: one setting per row with a visible value and type.

## Authoritative relationship and link sheets

`ParentRelationships`, `PartnerRelationships`, `UnionPartners`, `UnionChildren`, `HouseholdMembers`, `BranchConnections`, `BranchMemberships`, `PersonNicknames`, `PersonTags`, `StoryPeople`, `StoryEvents`, `EventPeople`, `EventBranches`, `EventMedia`, `MediaPeople`, `MediaEvents`, `MediaBranches`, `RecordSources`, `LegacyThemes`, `FeaturedRecords`, `BranchSurnames`, `BranchLocations`, and `BranchPeople`.

Each relationship exists once. Parent rows derive both parent and child views. Partner IDs use canonical pair ordering. Names beside IDs are display aids only; IDs remain authoritative.

The API reads current sheet cells and assembles the nested browser dataset dynamically. JSON is used only for API responses, exports, backups, rollback snapshots, and legacy transition tabs.

## Migration

Run in order:

1. `previewFlatSheetMigration()`
2. `runFlatSheetMigration()`
3. `verifyFlatSheetMigration()`
4. `validateWorkbook()`

Migration preserves IDs, is idempotent, extracts arrays into link rows, reports unmapped fields and conflicts, and creates `FlatBackup_*` before writing. Use `rollbackFlatSheetMigration(backupSheet)` to restore the pre-migration flat/link state. Legacy JSON tabs remain transition backups and are not read after schema v4 is verified.

Diagnostics must report `storageMode: "flat-normalized-authoritative"`, `schemaVersion: 4`, and `readiness: "ready"` before administrative writes are enabled.

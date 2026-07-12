# Genealogy administration

The Relationships admin tab edits parent links as evidence-bearing records. Select one parent only when only one parent is known. Choose `step`, `guardian`, `foster`, or `social-parent` for family roles that must not create biological descent. Adoption is recorded as `adoptive`. Saving updates the reciprocal child record and shows conflicts instead of silently changing disputed history.

The Unions tab records marriages, partnerships, former relationships, and co-parenting. Select only children documented for that union; selecting partners never assigns their children to one another. The Households tab records adults, children, and other members raised or living together without creating lineage or sibling facts.

To add a former spouse, create a union using `former-marriage` or `former-partnership`, set the dates and evidence, and select only documented union children. To add ancestors above the family home, create the people and ancestral branch, connect the parent records, add the branch to `root_branch_ids`, and leave `home_branch_id` unchanged. Multiple roots and unlinked research roots are valid.

## Apps Script deployment and migration

1. Open the spreadsheet's Apps Script project and replace `Code.gs` with [apps-script/Code.gs](apps-script/Code.gs).
2. Save, then run `previewFlatSheetMigration()` and review create, existing, unmapped, and conflict totals.
3. Run `runFlatSheetMigration()`. It creates a timestamped `FlatBackup_*` sheet and uses deterministic IDs, so reruns do not duplicate rows.
4. Run `verifyFlatSheetMigration()` and `validateWorkbook()`. Both must return `ok: true`.
5. Deploy a new Web App version using the existing `/exec` access settings. Do not change the frontend endpoint until the new deployment responds successfully.
6. In Admin → Diagnostics, run Test connection and then Test temporary save. The latter creates and removes an admin-only diagnostics source; it does not touch genealogy.

Rollback is non-destructive: call `rollbackFlatSheetMigration("FlatBackup_...")`. Original JSON tabs remain read-only transition backups, not editing surfaces or runtime sources.

The workbook contains Instructions and Data Dictionary tabs. Entity sheets use visible fields; repeating values use dedicated link sheets. Header rows are frozen and filtered, ID columns are warning-protected, and sheet categories are color-coded. Run `validateWorkbook()` after direct edits.

This static application has no real access control. Never enter exact living-person birth dates, addresses, contact details, medical/legal data, or private disputed evidence. `private` and `admin` records are excluded from public rich relationship views, but sensitive data should not be placed in a public repository at all.

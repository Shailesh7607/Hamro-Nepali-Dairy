> LEGACY REFERENCE: This document describes the old Sites-to-SQLite migration. For this Supabase edition use README.md and scripts/import-business-backup.mjs. Do not run this legacy procedure for new Hamro backups.

# Preserve existing orders and stock

No production data was moved in preparing this package. Test imports must use a separate offline database.

1. Finish and test independent hosting and email login first.
2. Export the current Site's complete admin backup. Keep an untouched, private copy. It contains personal data; never commit it to Git or publish it.
3. Reconcile the export's order counts, active reservations and stock quantities. A full export refuses oversized tables instead of silently truncating them.
4. Verify every ownership transfer using evidence of both the old account and the confirmed Supabase account. Obtain the exact Supabase UUID from Authentication → Users. Do not match by a typed email, phone or business name alone.
5. Prepare a private mapping JSON file. Each entry must contain `old_owner`, `supabase_user_id`, and a `verification_note` documenting who checked both identities and how. The `old_owner` comes from the actual backup, not a guessed platform account ID. Use `[]` if no ownership transfers have yet been verified.
6. Run:

```powershell
node scripts/import-sites-backup.mjs backup.json verified-identities.json NEW-shop.sqlite
```

The script refuses an existing target. It validates the source schema, restores all stock balances without reserving stock twice, namespaces old owners, and applies only the explicit identity mapping. Unmapped owners remain `legacy:...`: their records are preserved but cannot be accessed by unrelated customers. Historical actor IDs keep their legacy namespace. The audit mapping is stored in `identity_migrations`.

The mapping script validates format and records the supplied evidence; it cannot independently prove a human's identity. An administrator must verify that evidence before running it.

7. Test the imported database in isolation. Check order totals, reservations, customer isolation, admin views, cancellations and full delivery cycles. Check `PRAGMA integrity_check` and reconcile counts with the untouched export.
8. For real cutover, pause old-system writes, take a final export, import into a new database, repeat reconciliation, back it up and then switch the independent server to that file. Do not run the two systems as concurrent order/stock masters.
9. Keep the old Site intact and read-only during the transition. If rollback is needed after new orders arrive, reconcile those orders explicitly before reopening the old store; never discard them by restoring an old snapshot.

## Independent backup note

The inherited admin JSON export contains the ten business tables, not the Supabase user directory, role table, or local `identity_migrations` audit table. Keep those separate records backed up too. For a complete local snapshot, stop the server cleanly and copy the database with its WAL companions if any remain, or use a SQLite-aware online backup tool. Configure a real backup schedule separately; none is claimed enabled here.

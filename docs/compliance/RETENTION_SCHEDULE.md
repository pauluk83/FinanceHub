# Retention Schedule — DRAFT

**Status:** Working schedule for review. Confirm processor backup windows before
publishing. The app does not currently define a server-side retention job beyond the
limits below.

| Record | Where | Retention | Deletion route |
| --- | --- | --- | --- |
| Account and authentication identifiers | Supabase Auth | Until account deletion | Self-serve **Delete cloud account** (after `delete_my_account` migration) |
| Cloud budget document | Supabase `settings.state_json` | Until account deletion | Cascades from `auth.users` |
| Cloud conflict snapshots | Supabase `sync_conflicts` | At most 25 conflicts; at most two full pairs | Resolve, purge, or account deletion |
| Local budget copy | Browser/Electron storage | Until reset, local copy removal or app data removal | Settings / OS app-data removal |
| Encrypted credential vault | Synced document, ciphertext only | Until vault deletion or account deletion | Delete vault; account deletion |
| Restore points | Device storage | Newest seven; one automatic point per day | Remove individually; reset removes all |
| Exported backup | User's chosen location | User-controlled | User deletes the file |
| Plain safety copy before restore | User's downloads | User-controlled | User deletes the file |
| Support bundle | User's downloads / support mailbox | Only as long as needed for the request | Delete after resolution |
| App-lock and device settings | Device storage | Until reset or app data removal | Settings / OS |
| Hosting and authentication logs | InfinityFree / Supabase | Processor-defined | Processor retention controls |
| Processor backups | Supabase / hosting | Processor-defined; confirm in DPA | Processor deletion process |

## Rules

1. Do not keep a second copy of a deleted cloud account in a local "safety" file without
   a documented reason and an expiry date.
2. Pre-rotation conflict history and old backup files must be purged; they are not part
   of the current retention set.
3. Review this schedule at least annually, and whenever a processor, bank-linking feature
   or payment feature is added.
4. Account deletion is not complete while an exported backup or local workspace copy
   remains; tell the user this before deletion.

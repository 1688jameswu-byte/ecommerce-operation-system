# PostgreSQL Backup

## Scope

This backup process only exports the PostgreSQL database used by the 1688 business module:

- Database: `ecommerce_ops`
- Expected host: `localhost`
- Expected port: `5433`

It does not back up old JSON data, uploaded files, images, `node_modules`, `dist`, or `.env`.

## Manual Backup

Run from the project root:

```powershell
npm.cmd run backup:1688-db
```

The script reads `DATABASE_URL` from the project root `.env` file and calls the official PostgreSQL `pg_dump` binary.

Backups are saved to:

```text
F:\ecommerce-operation-system\backup\postgres
```

Backup file names use this format:

```text
ecommerce_ops_YYYYMMDD_HHmmss.sql
```

Example:

```text
ecommerce_ops_20260608_153000.sql
```

The script verifies that the generated backup file exists and is larger than 0 bytes.

## Restore Reference

Restore is intentionally manual. Do not run restore commands unless the target database and backup file have both been confirmed.

Reference command:

```powershell
$env:PGPASSWORD = "<database password>"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" `
  -h localhost `
  -p 5433 `
  -U ecommerce_ops_user `
  -d ecommerce_ops `
  -f "F:\ecommerce-operation-system\backup\postgres\ecommerce_ops_YYYYMMDD_HHmmss.sql"
Remove-Item Env:\PGPASSWORD
```

Before restoring, confirm:

- The target database is correct.
- The selected backup file is correct.
- A current backup exists if the target database already has important data.
- The restore is approved by an administrator.

Do not commit backup files or `.env` to Git.

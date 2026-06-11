# PostgreSQL Backup

## Scope

This backup process exports the PostgreSQL database used by the 1688 business module and copies the uploaded 1688 product images:

- Database: `ecommerce_ops`
- Uploaded images: `public/uploads/alibaba-1688` by default

It does not back up old JSON data, `node_modules`, `dist`, or `.env`.

## Manual Backup

Run from the project root:

```bash
npm run backup:1688-db
```

The script reads `DATABASE_URL` from the project root `.env` file and calls the official PostgreSQL `pg_dump` binary.

Backups are saved to `BACKUP_1688_DIR`, then `BACKUP_DIR`, then this default:

```text
./data/backup/alibaba-1688
```

Each backup creates one timestamped directory:

```text
1688-YYYYMMDD_HHmmss/
  manifest.json
  postgres/ecommerce_ops_YYYYMMDD_HHmmss.sql
  uploads/alibaba-1688/...
```

Recommended Tencent Cloud paths:

```text
BACKUP_1688_DIR=/data/ecommerce-ops/backups/alibaba-1688
UPLOADS_1688_DIR=/data/ecommerce-ops/uploads/alibaba-1688
```

If `UPLOADS_1688_DIR` is not set, the script copies `public/uploads/alibaba-1688`.

The script verifies that the generated database backup file exists and is larger than 0 bytes.

## Full Project Data Backup

To back up old JSON data plus 1688 PostgreSQL and uploaded 1688 images, run:

```bash
npm run backup:all
```

## Tencent Cloud Cron Example

Run daily at 02:30:

```bash
30 2 * * * cd /www/wwwroot/ecommerce-ops && /usr/bin/npm run backup:all >> /data/ecommerce-ops/backups/backup.log 2>&1
```

Confirm the actual project path and npm path on the server before enabling cron.

## Restore Reference

Restore is intentionally manual. Do not run restore commands unless the target database and backup file have both been confirmed.

Reference command:

```bash
export PGPASSWORD="<database password>"
psql \
  -h localhost \
  -p 5432 \
  -U ecommerce_ops_user \
  -d ecommerce_ops \
  -f "/data/ecommerce-ops/backups/alibaba-1688/1688-YYYYMMDD_HHmmss/postgres/ecommerce_ops_YYYYMMDD_HHmmss.sql"
unset PGPASSWORD
```

Before restoring, confirm:

- The target database is correct.
- The selected backup file is correct.
- A current backup exists if the target database already has important data.
- The restore is approved by an administrator.

Do not commit backup files or `.env` to Git.

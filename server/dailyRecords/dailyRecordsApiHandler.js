import fs from 'fs/promises';
import path from 'path';
import { queryAlibaba1688Database } from '../alibaba1688/postgresDatabase.js';

const businessCategories = new Set(['TEMU', '1688', '独立站', '运营管理', '员工管理', '系统开发', '产品供应链', '其他']);
const recordTypes = new Set(['工作动作', '想法', '问题', '决策', '待办', '复盘', '系统需求', '员工沟通']);
const importanceValues = new Set(['普通', '重要']);
const attachmentMaxBytes = 8 * 1024 * 1024;
const allowedAttachmentMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function parseRequestUrl(req) {
  const requestUrl = new URL(req.url ?? '/', 'http://local');
  const parts = requestUrl.pathname.split('/').filter(Boolean);
  return {
    id: parts[0] ? decodeURIComponent(parts[0]) : '',
    action: parts[1] ?? '',
    searchParams: requestUrl.searchParams,
  };
}

function camelizeRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
}

function getCurrentUserKey(currentUser) {
  return String(currentUser?.userId || currentUser?.username || '').trim();
}

function isBossUser(currentUser) {
  const roleCode = String(currentUser?.roleCode ?? '').toLowerCase();
  const permissionKeys = new Set(Array.isArray(currentUser?.permissionKeys) ? currentUser.permissionKeys : []);
  return roleCode.includes('boss') || permissionKeys.has('daily-records.manage') || permissionKeys.has('boss');
}

function canManageDailyRecords(currentUser) {
  return String(currentUser?.role ?? '').toLowerCase() === 'admin' || isBossUser(currentUser);
}

function canReadDailyRecord(record, currentUser) {
  return canManageDailyRecords(currentUser) || String(record?.createdBy ?? '') === getCurrentUserKey(currentUser);
}

function requireLogin(res, currentUser) {
  if (currentUser) {
    return true;
  }
  sendJson(res, 403, { ok: false, success: false, message: '请先登录' });
  return false;
}

function normalizePage(value) {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizePageSize(value) {
  const pageSize = Number(value);
  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return 20;
  }
  return Math.min(Math.floor(pageSize), 100);
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === '1' || value === '是';
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function normalizeRecordInput(body = {}, currentUser) {
  const content = String(body.content ?? '').trim();
  if (!content) {
    const error = new Error('请先填写记录内容');
    error.statusCode = 400;
    throw error;
  }

  const businessCategory = businessCategories.has(body.businessCategory) ? body.businessCategory : '其他';
  const recordType = recordTypes.has(body.recordType) ? body.recordType : '工作动作';
  const importance = importanceValues.has(body.importance) ? body.importance : '普通';
  const recordDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.recordDate ?? '')) ? String(body.recordDate) : todayKey();

  return {
    recordDate,
    content,
    businessCategory,
    recordType,
    importance,
    aiMemoryEnabled: normalizeBoolean(body.aiMemoryEnabled),
    aiMemoryNote: String(body.aiMemoryNote ?? '').trim(),
    sourceDevice: String(body.sourceDevice ?? '').trim() || '电脑端',
    status: String(body.status ?? '').trim() || 'active',
    createdBy: getCurrentUserKey(currentUser),
  };
}

function buildListWhere(searchParams, currentUser) {
  const clauses = ['deleted_at IS NULL'];
  const values = [];
  const addParam = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (!canManageDailyRecords(currentUser)) {
    clauses.push(`created_by = ${addParam(getCurrentUserKey(currentUser))}`);
  }

  if (searchParams.get('dateFrom')) {
    clauses.push(`record_date >= ${addParam(searchParams.get('dateFrom'))}`);
  }
  if (searchParams.get('dateTo')) {
    clauses.push(`record_date <= ${addParam(searchParams.get('dateTo'))}`);
  }
  if (searchParams.get('businessCategory')) {
    clauses.push(`business_category = ${addParam(searchParams.get('businessCategory'))}`);
  }
  if (searchParams.get('recordType')) {
    clauses.push(`record_type = ${addParam(searchParams.get('recordType'))}`);
  }
  if (searchParams.get('importance')) {
    clauses.push(`importance = ${addParam(searchParams.get('importance'))}`);
  }
  if (searchParams.get('aiMemoryEnabled')) {
    clauses.push(`ai_memory_enabled = ${addParam(searchParams.get('aiMemoryEnabled') === 'true')}`);
  }
  if (searchParams.get('keyword')) {
    const keyword = `%${searchParams.get('keyword').trim()}%`;
    clauses.push(`(content ILIKE ${addParam(keyword)} OR ai_memory_note ILIKE ${addParam(keyword)})`);
  }

  return {
    sql: `WHERE ${clauses.join(' AND ')}`,
    values,
  };
}

async function addAttachments(records) {
  if (records.length === 0) {
    return records;
  }

  const ids = records.map((record) => record.id);
  const result = await queryAlibaba1688Database(
    `SELECT id::text, record_id::text, file_url, file_name, file_type, created_at
     FROM daily_record_attachments
     WHERE record_id::text = ANY($1::text[])
     ORDER BY created_at ASC`,
    [ids],
  );
  const attachmentsByRecord = new Map();
  for (const row of result.rows) {
    const attachment = camelizeRow(row);
    const list = attachmentsByRecord.get(attachment.recordId) ?? [];
    list.push(attachment);
    attachmentsByRecord.set(attachment.recordId, list);
  }
  return records.map((record) => ({
    ...record,
    attachments: attachmentsByRecord.get(record.id) ?? [],
  }));
}

async function listRecords(searchParams, currentUser) {
  const page = normalizePage(searchParams.get('page'));
  const pageSize = normalizePageSize(searchParams.get('pageSize'));
  const offset = (page - 1) * pageSize;
  const where = buildListWhere(searchParams, currentUser);
  const totalResult = await queryAlibaba1688Database(
    `SELECT COUNT(*)::int AS total FROM daily_records ${where.sql}`,
    where.values,
  );
  const dataValues = [...where.values, pageSize, offset];
  const recordsResult = await queryAlibaba1688Database(
    `SELECT id::text, record_date, content, business_category, record_type, importance,
            ai_memory_enabled, ai_memory_note, source_device, status, created_by,
            created_at, updated_at, deleted_at
     FROM daily_records
     ${where.sql}
     ORDER BY created_at DESC
     LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues,
  );

  return {
    records: await addAttachments(recordsResult.rows.map(camelizeRow)),
    total: totalResult.rows[0]?.total ?? 0,
    page,
    pageSize,
  };
}

async function getRecordById(id) {
  const result = await queryAlibaba1688Database(
    `SELECT id::text, record_date, content, business_category, record_type, importance,
            ai_memory_enabled, ai_memory_note, source_device, status, created_by,
            created_at, updated_at, deleted_at
     FROM daily_records
     WHERE id::text = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );
  const record = result.rows[0] ? camelizeRow(result.rows[0]) : null;
  return record ? (await addAttachments([record]))[0] : null;
}

async function createRecord(body, currentUser) {
  const input = normalizeRecordInput(body, currentUser);
  const result = await queryAlibaba1688Database(
    `INSERT INTO daily_records (
       record_date, content, business_category, record_type, importance,
       ai_memory_enabled, ai_memory_note, source_device, status, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8, $9, $10)
     RETURNING id::text, record_date, content, business_category, record_type, importance,
       ai_memory_enabled, ai_memory_note, source_device, status, created_by, created_at, updated_at, deleted_at`,
    [
      input.recordDate,
      input.content,
      input.businessCategory,
      input.recordType,
      input.importance,
      input.aiMemoryEnabled,
      input.aiMemoryNote,
      input.sourceDevice,
      input.status,
      input.createdBy,
    ],
  );
  return (await addAttachments([camelizeRow(result.rows[0])]))[0];
}

async function updateRecord(id, body, currentUser) {
  const current = await getRecordById(id);
  if (!current) {
    return null;
  }
  if (!canReadDailyRecord(current, currentUser)) {
    const error = new Error('当前账号无权编辑该记录');
    error.statusCode = 403;
    throw error;
  }

  const merged = normalizeRecordInput({ ...current, ...body }, currentUser);
  const result = await queryAlibaba1688Database(
    `UPDATE daily_records
     SET record_date = $1,
         content = $2,
         business_category = $3,
         record_type = $4,
         importance = $5,
         ai_memory_enabled = $6,
         ai_memory_note = NULLIF($7, ''),
         source_device = $8,
         status = $9,
         updated_at = NOW()
     WHERE id::text = $10 AND deleted_at IS NULL
     RETURNING id::text, record_date, content, business_category, record_type, importance,
       ai_memory_enabled, ai_memory_note, source_device, status, created_by, created_at, updated_at, deleted_at`,
    [
      merged.recordDate,
      merged.content,
      merged.businessCategory,
      merged.recordType,
      merged.importance,
      merged.aiMemoryEnabled,
      merged.aiMemoryNote,
      merged.sourceDevice,
      merged.status,
      id,
    ],
  );

  return result.rows[0] ? (await addAttachments([camelizeRow(result.rows[0])]))[0] : null;
}

async function deleteRecord(id, currentUser) {
  const current = await getRecordById(id);
  if (!current) {
    return false;
  }
  if (!canManageDailyRecords(currentUser)) {
    const error = new Error('只有管理员/老板可以删除每日记录');
    error.statusCode = 403;
    throw error;
  }
  await queryAlibaba1688Database(
    `UPDATE daily_records
     SET deleted_at = NOW(), status = 'deleted', updated_at = NOW()
     WHERE id::text = $1`,
    [id],
  );
  return true;
}

function buildAttachmentFileName(originalName, contentType) {
  const fallbackExtension = contentType === 'image/png'
    ? 'png'
    : contentType === 'image/webp'
      ? 'webp'
      : contentType === 'image/gif'
        ? 'gif'
        : 'jpg';
  const parsed = path.parse(String(originalName ?? 'daily-record-image').replace(/[\\/]/g, ''));
  const safeStem = (parsed.name || 'daily-record-image')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'daily-record-image';
  const originalExtension = parsed.ext.replace(/^\./, '').toLowerCase();
  const extension = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(originalExtension) ? originalExtension : fallbackExtension;
  return `${safeStem}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
}

async function saveAttachmentFile(body) {
  const dataUrl = String(body?.dataUrl ?? '');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([\s\S]+)$/i);
  if (!match) {
    const error = new Error('请上传 JPG、PNG、WEBP 或 GIF 图片');
    error.statusCode = 400;
    throw error;
  }

  const contentType = match[1].toLowerCase();
  if (!allowedAttachmentMimeTypes.has(contentType)) {
    const error = new Error('图片格式不支持');
    error.statusCode = 415;
    throw error;
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > attachmentMaxBytes) {
    const error = new Error('图片不能超过 8MB');
    error.statusCode = 413;
    throw error;
  }

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uploadRoot = path.resolve(process.env.UPLOADS_DAILY_RECORDS_DIR || path.join(process.cwd(), 'public', 'uploads', 'daily-records'));
  const uploadDir = path.join(uploadRoot, year, month);
  const fileName = buildAttachmentFileName(body?.fileName, contentType);
  const filePath = path.join(uploadDir, fileName);
  const safeRoot = path.resolve(uploadRoot);
  const safeFilePath = path.resolve(filePath);
  if (!safeFilePath.startsWith(`${safeRoot}${path.sep}`)) {
    const error = new Error('图片文件名不合法');
    error.statusCode = 400;
    throw error;
  }

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(filePath, buffer);
  return {
    fileUrl: `/uploads/daily-records/${year}/${month}/${fileName}`,
    fileName,
    fileType: contentType,
  };
}

async function createAttachment(recordId, body, currentUser) {
  const record = await getRecordById(recordId);
  if (!record) {
    return null;
  }
  if (!canReadDailyRecord(record, currentUser)) {
    const error = new Error('当前账号无权给该记录上传附件');
    error.statusCode = 403;
    throw error;
  }

  const file = await saveAttachmentFile(body);
  const result = await queryAlibaba1688Database(
    `INSERT INTO daily_record_attachments (record_id, file_url, file_name, file_type)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text, record_id::text, file_url, file_name, file_type, created_at`,
    [recordId, file.fileUrl, file.fileName, file.fileType],
  );
  return camelizeRow(result.rows[0]);
}

export async function handleDailyRecordsApi(req, res, options = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const requestContext = parseRequestUrl(req);

  try {
    const currentUser = options.getCurrentUser?.() ?? null;
    if (!requireLogin(res, currentUser)) {
      return;
    }

    const { id, action, searchParams } = requestContext;

    if (req.method === 'GET' && !id) {
      sendJson(res, 200, await listRecords(searchParams, currentUser));
      return;
    }

    if (req.method === 'GET' && id) {
      const record = await getRecordById(id);
      if (!record) {
        sendJson(res, 404, { ok: false, message: 'Not found' });
        return;
      }
      if (!canReadDailyRecord(record, currentUser)) {
        sendJson(res, 403, { ok: false, message: '当前账号无权查看该记录' });
        return;
      }
      sendJson(res, 200, record);
      return;
    }

    if (req.method === 'POST' && !id) {
      sendJson(res, 200, await createRecord(JSON.parse((await options.readBody?.(req)) || '{}'), currentUser));
      return;
    }

    if (req.method === 'POST' && id && action === 'attachments') {
      const attachment = await createAttachment(id, JSON.parse((await options.readBody?.(req)) || '{}'), currentUser);
      if (!attachment) {
        sendJson(res, 404, { ok: false, message: 'Not found' });
        return;
      }
      sendJson(res, 200, attachment);
      return;
    }

    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const updated = await updateRecord(id, JSON.parse((await options.readBody?.(req)) || '{}'), currentUser);
      if (!updated) {
        sendJson(res, 404, { ok: false, message: 'Not found' });
        return;
      }
      sendJson(res, 200, updated);
      return;
    }

    if (req.method === 'DELETE' && id) {
      sendJson(res, 200, { ok: await deleteRecord(id, currentUser) });
      return;
    }

    res.statusCode = 405;
    res.end('Method not allowed');
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      scope: 'daily-records-api',
      message: 'request failed',
      statusCode,
      errorMessage: message,
      errorCode: error?.code,
      errorStack: error?.stack,
    }));
    sendJson(res, statusCode, {
      ok: false,
      success: false,
      code: error?.code,
      message,
      error: message,
    });
  }
}

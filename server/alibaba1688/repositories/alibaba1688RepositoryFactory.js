import { queryAlibaba1688Database } from '../postgresDatabase.js';

const toSnake = (value) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const camelizeRow = (row) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    value,
  ]),
);

const normalizePage = (value) => {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
};

const normalizePageSize = (value) => {
  const pageSize = Number(value);
  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return 20;
  }
  return Math.min(Math.floor(pageSize), 100);
};

function makeParam(values, value) {
  values.push(value);
  return `$${values.length}`;
}

function buildWhere(config, params = {}) {
  const clauses = [];
  const values = [];

  if (params.keyword && config.searchColumns?.length) {
    const keyword = `%${String(params.keyword).trim()}%`;
    clauses.push(`(${config.searchColumns.map((column) => `${column} ILIKE ${makeParam(values, keyword)}`).join(' OR ')})`);
  }

  for (const [paramName, column] of Object.entries(config.filterColumns ?? {})) {
    const value = params[paramName];
    if (value !== undefined && value !== '') {
      clauses.push(`${column} = ${makeParam(values, value)}`);
    }
  }

  if (params.createdFrom) {
    clauses.push(`created_at >= ${makeParam(values, params.createdFrom)}`);
  }

  if (params.createdTo) {
    clauses.push(`created_at <= ${makeParam(values, params.createdTo)}`);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

function normalizeInput(config, input = {}, current = {}) {
  const next = {
    ...(config.defaults ?? {}),
    ...current,
    ...input,
  };

  for (const field of config.requiredFields ?? []) {
    if (!String(next[field] ?? '').trim()) {
      throw new Error(`${field} is required`);
    }
  }

  return next;
}

function toColumnValuePairs(config, record, { includeId = false } = {}) {
  return config.fields
    .filter((field) => includeId || field !== 'id')
    .filter((field) => field !== 'createdAt' && field !== 'updatedAt')
    .filter((field) => record[field] !== undefined)
    .map((field) => [toSnake(field), record[field]]);
}

export function createAlibaba1688Repository(config) {
  return {
    async list(params = {}) {
      const page = normalizePage(params.page);
      const pageSize = normalizePageSize(params.pageSize);
      const offset = (page - 1) * pageSize;
      const where = buildWhere(config, params);
      const orderBy = config.orderBy || 'created_at DESC';
      const totalResult = await queryAlibaba1688Database(
        `SELECT COUNT(*)::int AS total FROM ${config.tableName} ${where.sql}`,
        where.values,
      );
      const dataValues = [...where.values, pageSize, offset];
      const recordsResult = await queryAlibaba1688Database(
        `SELECT * FROM ${config.tableName} ${where.sql} ORDER BY ${orderBy} LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
        dataValues,
      );

      return {
        records: recordsResult.rows.map(camelizeRow),
        total: totalResult.rows[0]?.total ?? 0,
        page,
        pageSize,
      };
    },

    async getById(id) {
      const result = await queryAlibaba1688Database(
        `SELECT * FROM ${config.tableName} WHERE id = $1`,
        [id],
      );
      return result.rows[0] ? camelizeRow(result.rows[0]) : null;
    },

    async create(input) {
      const record = normalizeInput(config, input);
      const pairs = toColumnValuePairs(config, record);
      const columns = pairs.map(([column]) => column);
      const values = pairs.map(([, value]) => value);
      const placeholders = values.map((_, index) => `$${index + 1}`);
      const result = await queryAlibaba1688Database(
        `INSERT INTO ${config.tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        values,
      );
      return camelizeRow(result.rows[0]);
    },

    async update(id, input) {
      const current = await this.getById(id);
      if (!current) {
        return null;
      }

      const record = normalizeInput(config, input, current);
      const pairs = toColumnValuePairs(config, record);
      const values = pairs.map(([, value]) => value);
      values.push(id);
      const result = await queryAlibaba1688Database(
        `UPDATE ${config.tableName}
         SET ${pairs.map(([column], index) => `${column} = $${index + 1}`).join(', ')}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING *`,
        values,
      );
      return result.rows[0] ? camelizeRow(result.rows[0]) : null;
    },

    async remove(id) {
      const result = await queryAlibaba1688Database(
        `DELETE FROM ${config.tableName} WHERE id = $1`,
        [id],
      );
      return result.rowCount > 0;
    },
  };
}

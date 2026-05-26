import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const resolveProjectPath = (value, fallback) => path.resolve(process.cwd(), value || fallback);

const dataDir = resolveProjectPath(process.env.DATA_DIR, 'data');
const backupRootDir = resolveProjectPath(process.env.BACKUP_DIR, path.join(dataDir, 'backup'));
const dataFiles = {
  stores: 'stores.json',
  operators: 'operators.json',
  tasks: 'tasks.json',
  taskSuggestionTemplates: 'task-suggestion-templates.json',
  orderImportStore: 'order-import-store.json',
  storeOperatorRelations: 'store-operator-relations.json',
  trafficConversionStore: 'raw/traffic-conversion-store.json',
  trafficWarningRules: 'traffic-warning-rules.json',
  orderDailySummary: 'summary/order-daily-summary.json',
  trafficDailySummary: 'summary/traffic-daily-summary.json',
  riskResults: 'analysis/risk-results.json',
  growthOpportunities: 'analysis/growth-opportunities.json',
  businessAnalysisItems: 'analysis/business-analysis-items.json',
  salaryEmployees: 'employees.json',
  salaryPeriods: 'salary-periods.json',
  salaryAttendanceRecords: 'attendance-records.json',
  salaryAttendanceRules: 'salary-attendance-rules.json',
  salaryPieceworkRecords: 'piecework-records.json',
  salaryPlans: 'salary-plans.json',
  salaryItems: 'salary-items.json',
  employeeSalaryPlans: 'employee-salary-plans.json',
  salaryRecords: 'salary-records.json',
  users: 'users.json',
  authSessions: 'auth-sessions.json',
  userPermissions: 'user-permissions.json',
};

function formatBackupTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function copyJsonFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return 1;
}

function copyJsonFiles(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return 0;
  }

  return fs.readdirSync(sourceDir, { withFileTypes: true }).reduce((count, item) => {
    const source = path.join(sourceDir, item.name);
    const target = path.join(targetDir, item.name);

    if (item.isDirectory()) {
      return count + copyJsonFiles(source, target);
    }

    return item.isFile() && item.name.endsWith('.json') ? count + copyJsonFile(source, target) : count;
  }, 0);
}

function countJsonFiles(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    return 0;
  }

  return fs.readdirSync(sourceDir, { withFileTypes: true }).reduce((count, item) => {
    const source = path.join(sourceDir, item.name);

    if (item.isDirectory()) {
      return count + countJsonFiles(source);
    }

    return count + (item.isFile() && item.name.endsWith('.json') ? 1 : 0);
  }, 0);
}

function backupDataFiles() {
  const backupDirName = `backup-${formatBackupTime(new Date())}`;
  const backupDir = path.join(backupRootDir, backupDirName);
  let fileCount = 0;

  fs.mkdirSync(backupDir, { recursive: true });

  for (const dirName of ['raw', 'summary', 'analysis']) {
    fileCount += copyJsonFiles(path.join(dataDir, dirName), path.join(backupDir, dirName));
  }

  if (fs.existsSync(dataDir)) {
    for (const item of fs.readdirSync(dataDir, { withFileTypes: true })) {
      if (item.isFile() && item.name.endsWith('.json')) {
        fileCount += copyJsonFile(path.join(dataDir, item.name), path.join(backupDir, item.name));
      }
    }
  }

  return { path: backupDir, fileCount };
}

function listBackups() {
  const backupsDir = backupRootDir;

  if (!fs.existsSync(backupsDir)) {
    return [];
  }

  return fs.readdirSync(backupsDir, { withFileTypes: true })
    .filter((item) => item.isDirectory() && item.name.startsWith('backup-'))
    .map((item) => {
      const backupPath = path.join(backupsDir, item.name);
      const stat = fs.statSync(backupPath);
      return {
        name: item.name,
        path: backupPath,
        fileCount: countJsonFiles(backupPath),
        createdAt: stat.birthtime.toISOString(),
      };
    })
    .sort((first, second) => second.name.localeCompare(first.name));
}

function deleteBackup(name) {
  if (!/^backup-\d{4}-\d{2}-\d{2}-\d{6}$/.test(name)) {
    throw new Error('Invalid backup name');
  }

  const backupsDir = backupRootDir;
  const backupPath = path.resolve(backupsDir, name);
  const safeRoot = path.resolve(backupsDir);

  if (!backupPath.startsWith(`${safeRoot}${path.sep}`)) {
    throw new Error('Invalid backup path');
  }

  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup not found');
  }

  fs.rmSync(backupPath, { recursive: true, force: false });
  return { name, path: backupPath };
}

function ensureDataFile(name) {
  fs.mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, dataFiles[name]);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    const legacyFilePath = path.join(dataDir, `${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.json`);
    if (name === 'trafficConversionStore' && fs.existsSync(legacyFilePath)) {
      fs.copyFileSync(legacyFilePath, filePath);
      return filePath;
    }

    const initial = name === 'users'
      ? JSON.stringify(getDefaultUsers(), null, 2)
      : name === 'authSessions'
        ? '{}'
        : name === 'userPermissions'
          ? '[]'
        : name === 'taskSuggestionTemplates'
      ? JSON.stringify(getDefaultTaskSuggestionTemplates(), null, 2)
      : name === 'storeOperatorRelations' || name === 'operators' || name === 'stores' || name === 'tasks' || name === 'salaryEmployees' || name === 'salaryPeriods' || name === 'salaryAttendanceRecords' || name === 'salaryAttendanceRules' || name === 'salaryPieceworkRecords' || name === 'salaryPlans' || name === 'salaryItems' || name === 'employeeSalaryPlans' || name === 'salaryRecords'
        ? '[]'
        : name === 'orderDailySummary' || name === 'trafficDailySummary'
        ? '{"items":[],"updatedAt":""}'
        : name === 'riskResults' || name === 'growthOpportunities' || name === 'businessAnalysisItems'
          ? '{"items":[],"updatedAt":""}'
          : name === 'trafficConversionStore'
            ? '{"records":[]}'
            : name === 'trafficWarningRules'
              ? '{"settings":{"displayLimit":5},"rules":[]}'
              : '{"batches":[]}';
    fs.writeFileSync(filePath, initial, 'utf-8');
  }

  return filePath;
}

function readJsonFile(name) {
  const filePath = ensureDataFile(name);

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

function writeJsonFile(name, value) {
  const filePath = ensureDataFile(name);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

function nowIso() {
  return new Date().toISOString();
}

const authCookieName = 'ops_session';
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;
const defaultPassword = '123456';
const menuKeys = {
  dashboard: 'dashboard',
  dataCenter: 'data-center',
  orderSalesImport: 'order-sales-import',
  trafficConversionImport: 'traffic-conversion-import',
  dataManagement: 'data-management',
  dataBackup: 'data-backup',
  storeData: 'store-data',
  operationData: 'operation-data',
  analysisResults: 'analysis-results',
  storeManagement: 'store-management',
  operatorManagement: 'operator-management',
  accountManagement: 'account-management',
  businessAnalysis: 'business-analysis',
  businessAnalysisCenter: 'business-analysis-center',
  operationDiagnosis: 'operation-diagnosis',
  aiOperationAnalysis: 'ai-operation-analysis',
  operatorPerformance: 'operator-performance',
  growthOpportunities: 'growth-opportunities',
  operationLoop: 'operation-loop',
  operationTasks: 'operation-tasks',
  taskSuggestions: 'task-suggestions',
  ruleCenter: 'rule-center',
  kpiRules: 'kpi-rules',
  rankingRules: 'ranking-rules',
  businessRules: 'business-rules',
  anomalyRules: 'anomaly-rules',
  dataSource: 'data-source',
  dataSourceConfig: 'data-source-config',
  salaryPerformance: 'salary-performance',
  salaryEmployees: 'salary-employees',
  salaryPeriods: 'salary-periods',
  salaryImportTemplates: 'salary-import-templates',
  salaryAttendanceImport: 'salary-attendance-import',
  salaryPieceworkImport: 'salary-piecework-import',
  salaryDetails: 'salary-details',
  salaryPlan: 'salary-plan',
};
const allMenuKeys = Object.values(menuKeys);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2:sha256:${iterations}:${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [method, digest, iterationsText, salt, expectedHash] = String(passwordHash).split(':');

  if (method !== 'pbkdf2' || digest !== 'sha256' || !salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.pbkdf2Sync(String(password), salt, Number(iterationsText), 32, digest).toString('hex');
  const actualBuffer = Buffer.from(actualHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function getDefaultUsers() {
  const time = nowIso();
  return [
    {
      userId: 'user-admin',
      username: 'admin',
      passwordHash: 'pbkdf2:sha256:100000:44403aeba6b140d743b90e3cadaaf141:ab05743a9911f4c09b8a704168e9c8874c5ceecdd7c92ebda897ab3a966d6ff7',
      displayName: '管理员',
      role: 'admin',
      operatorId: '',
      teamId: '',
      allowedStoreIds: [],
      status: 'active',
      createdAt: time,
      updatedAt: time,
    },
    {
      userId: 'user-leader01',
      username: 'leader01',
      passwordHash: 'pbkdf2:sha256:100000:d55db140d4d594b4fd8fb42d7aea28f4:4f56c3bff5f7c8f21276edfcbdb16a3d8fff5012036cf90318337186b5608a58',
      displayName: '组长01',
      role: 'leader',
      operatorId: '',
      teamId: 'team-01',
      allowedStoreIds: [],
      status: 'active',
      createdAt: time,
      updatedAt: time,
    },
    {
      userId: 'user-operator01',
      username: 'operator01',
      passwordHash: 'pbkdf2:sha256:100000:ea2f5a455056617cf38744443d5b89eb:1ea6ce730af89b778c92ae6e94f3f1cdb86f23974e40bb31f2c3d264c59bff7f',
      displayName: '运营01',
      role: 'operator',
      operatorId: 'operator01',
      teamId: 'team-01',
      allowedStoreIds: [],
      status: 'active',
      createdAt: time,
      updatedAt: time,
    },
  ];
}

function toCurrentUser(user) {
  if (!user) {
    return null;
  }

  const permission = getUserPermission(user.userId);
  const baseUser = {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    operatorId: user.operatorId ?? '',
    operatorName: user.operatorName ?? user.displayName ?? user.username ?? '',
    teamId: user.teamId ?? '',
    allowedStoreIds: normalizeAllowedStoreIds(permission?.visibleStoreIds ?? user.allowedStoreIds),
  };
  const visibleStoreKeys = baseUser.role === 'admin'
    ? []
    : unique(getVisibleStores(baseUser).flatMap((store) => [store.id, store.storeName].filter(Boolean)));

  return {
    ...baseUser,
    allowedStoreIds: baseUser.role === 'admin' ? [] : visibleStoreKeys,
    allowedMenuKeys: getAllowedMenuKeys(user),
    passwordUpdatedAt: user.passwordUpdatedAt ?? '',
    forceChangePassword: Boolean(user.forceChangePassword),
  };
}

function toPublicUser(user) {
  return {
    ...toCurrentUser(user),
    status: user.status === 'disabled' ? 'disabled' : 'active',
    passwordUpdatedAt: user.passwordUpdatedAt ?? '',
    forceChangePassword: Boolean(user.forceChangePassword),
    createdAt: user.createdAt ?? '',
    updatedAt: user.updatedAt ?? '',
  };
}

function requireAdmin(req, res) {
  const user = findCurrentUser(req);

  if (!user || user.role !== 'admin') {
    res.statusCode = 403;
    res.end(JSON.stringify({ success: false, message: '无权访问' }));
    return null;
  }

  return user;
}

function normalizeAllowedStoreIds(value) {
  return Array.isArray(value)
    ? unique(value.map((item) => String(item ?? '').trim()))
    : [];
}

function normalizeAllowedMenuKeys(value, role) {
  if (role === 'admin') {
    return allMenuKeys;
  }

  return Array.isArray(value)
    ? unique(value.map((item) => String(item ?? '').trim()).filter((item) => allMenuKeys.includes(item)))
    : [];
}

function readUserPermissions() {
  const value = readJsonFile('userPermissions');
  return Array.isArray(value) ? value : [];
}

function getUserPermission(userId) {
  return readUserPermissions().find((item) => item?.userId === userId) ?? null;
}

function writeUserPermission(userId, payload, role) {
  const permissions = readUserPermissions();
  const current = permissions.find((item) => item?.userId === userId) ?? {};
  const next = {
    ...current,
    userId,
    visibleStoreIds: normalizeAllowedStoreIds(payload.allowedStoreIds ?? payload.visibleStoreIds ?? current.visibleStoreIds),
    allowedMenuKeys: normalizeAllowedMenuKeys(payload.allowedMenuKeys ?? current.allowedMenuKeys, role),
  };
  writeJsonFile('userPermissions', [
    ...permissions.filter((item) => item?.userId !== userId),
    next,
  ]);
}

function getAllowedMenuKeys(user) {
  if (!user) {
    return [];
  }

  const permission = getUserPermission(user.userId);
  return normalizeAllowedMenuKeys(permission?.allowedMenuKeys ?? user.allowedMenuKeys, user.role);
}

function userCanAccessMenu(user, menuKey) {
  return user?.role === 'admin' || getAllowedMenuKeys(user).includes(menuKey);
}

function requireMenu(req, res, menuKey) {
  const user = findCurrentUser(req);

  if (!user || !userCanAccessMenu(user, menuKey)) {
    res.statusCode = 403;
    res.end(JSON.stringify({ success: false, message: '无权访问' }));
    return null;
  }

  return user;
}

function normalizeUserPayload(payload, current) {
  const time = nowIso();
  const username = String(payload.username ?? current?.username ?? '').trim();
  const displayName = String(payload.displayName ?? current?.displayName ?? username).trim();
  const role = ['admin', 'leader', 'operator'].includes(payload.role) ? payload.role : current?.role ?? 'operator';
  const status = ['active', 'disabled'].includes(payload.status) ? payload.status : current?.status ?? 'active';

  if (!username) {
    throw new Error('username is required');
  }

  return {
    ...current,
    userId: current?.userId ?? payload.userId ?? createId('user'),
    username,
    displayName,
    role,
    operatorId: String(payload.operatorId ?? current?.operatorId ?? '').trim(),
    teamId: String(payload.teamId ?? current?.teamId ?? '').trim(),
    allowedStoreIds: normalizeAllowedStoreIds(payload.allowedStoreIds ?? current?.allowedStoreIds),
    status,
    passwordUpdatedAt: current?.passwordUpdatedAt ?? '',
    forceChangePassword: Boolean(current?.forceChangePassword),
    createdAt: current?.createdAt ?? time,
    updatedAt: time,
  };
}

function removeUserPermission(userId) {
  const permissions = readJsonFile('userPermissions');

  if (Array.isArray(permissions)) {
    writeJsonFile('userPermissions', permissions.filter((item) => item?.userId !== userId));
    return;
  }

  if (permissions && typeof permissions === 'object') {
    const next = { ...permissions };
    delete next[userId];
    writeJsonFile('userPermissions', next);
  }
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (
    process.env.NODE_ENV === 'production' &&
    (!secret || secret === 'replace-with-server-secret' || secret === 'replace-with-a-long-random-string')
  ) {
    throw new Error('生产环境必须配置有效 SESSION_SECRET');
  }

  return secret || 'dev-session-secret';
}

function signSessionId(sessionId) {
  return crypto.createHmac('sha256', getSessionSecret()).update(sessionId).digest('hex');
}

function createCookie(sessionId) {
  return `${authCookieName}=${sessionId}.${signSessionId(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}`;
}

function clearCookie() {
  return `${authCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie ?? '').split(';').map((item) => {
    const [key, ...value] = item.trim().split('=');
    return [key, value.join('=')];
  }).filter(([key]) => key));
}

function getSignedSessionId(req) {
  const value = parseCookies(req)[authCookieName];
  const [sessionId, signature] = String(value ?? '').split('.');

  if (!sessionId || !signature || signSessionId(sessionId) !== signature) {
    return '';
  }

  return sessionId;
}

function readSessions() {
  const sessions = readJsonFile('authSessions');
  return sessions && typeof sessions === 'object' && !Array.isArray(sessions) ? sessions : {};
}

function writeSessions(sessions) {
  writeJsonFile('authSessions', sessions);
}

function findCurrentUser(req) {
  const sessionId = getSignedSessionId(req);

  if (!sessionId) {
    return null;
  }

  const sessions = readSessions();
  const session = sessions[sessionId];

  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    delete sessions[sessionId];
    writeSessions(sessions);
    return null;
  }

  const users = readJsonFile('users');
  return Array.isArray(users)
    ? users.find((user) => user.userId === session.userId && user.status === 'active') ?? null
    : null;
}

async function handleAuthApi(req, res, next) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const pathname = (req.url ?? '').split('?')[0];

  if (pathname === '/login' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const users = readJsonFile('users');
    const user = Array.isArray(users)
      ? users.find((item) => item.username === username && item.status === 'active')
      : null;

    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.statusCode = 401;
      res.end(JSON.stringify({ success: false, message: '账号或密码错误' }));
      return;
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    const sessions = readSessions();
    sessions[sessionId] = {
      userId: user.userId,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString(),
    };
    writeSessions(sessions);
    res.setHeader('Set-Cookie', createCookie(sessionId));
    res.end(JSON.stringify({ success: true, user: toCurrentUser(user) }));
    return;
  }

  if (pathname === '/me' && req.method === 'GET') {
    const user = findCurrentUser(req);
    res.end(JSON.stringify({ success: Boolean(user), user: toCurrentUser(user) }));
    return;
  }

  if (pathname === '/logout' && req.method === 'POST') {
    const sessionId = getSignedSessionId(req);
    const sessions = readSessions();

    if (sessionId) {
      delete sessions[sessionId];
      writeSessions(sessions);
    }

    res.setHeader('Set-Cookie', clearCookie());
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (pathname === '/change-password' && req.method === 'POST') {
    const currentUser = findCurrentUser(req);
    if (!currentUser) {
      res.statusCode = 401;
      res.end(JSON.stringify({ success: false, message: '请先登录' }));
      return;
    }

    const body = JSON.parse((await readBody(req)) || '{}');
    const password = String(body.password ?? '');
    if (!password) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, message: '密码不能为空' }));
      return;
    }

    const users = Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [];
    const updatedAt = nowIso();
    const next = {
      ...currentUser,
      passwordHash: hashPassword(password),
      passwordUpdatedAt: updatedAt,
      forceChangePassword: false,
      updatedAt,
    };
    writeJsonFile('users', users.map((user) => user.userId === currentUser.userId ? next : user));
    res.end(JSON.stringify({ success: true, user: toCurrentUser(next) }));
    return;
  }

  if (pathname === '/users' && req.method === 'GET') {
    if (!requireAdmin(req, res)) {
      return;
    }

    const users = readJsonFile('users');
    res.end(JSON.stringify({
      success: true,
      users: Array.isArray(users) ? users.map(toPublicUser) : [],
    }));
    return;
  }

  if (pathname === '/users' && req.method === 'POST') {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const users = Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [];

      if (users.some((user) => user.username === String(body.username ?? '').trim())) {
        res.statusCode = 409;
        res.end(JSON.stringify({ success: false, message: '用户名已存在' }));
        return;
      }
      const password = String(body.password ?? '') || defaultPassword;
      const updatedAt = nowIso();
      const user = {
        ...normalizeUserPayload(body),
        passwordHash: hashPassword(password),
        passwordUpdatedAt: updatedAt,
        forceChangePassword: true,
      };
      writeJsonFile('users', [...users, user]);
      writeUserPermission(user.userId, body, user.role);
      res.end(JSON.stringify({ success: true, user: toPublicUser(user) }));
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
    return;
  }

  if (pathname.startsWith('/users/') && req.method === 'PUT') {
    const adminUser = requireAdmin(req, res);
    if (!adminUser) {
      return;
    }

    const userId = decodeURIComponent(pathname.replace('/users/', ''));
    const body = JSON.parse((await readBody(req)) || '{}');
    const users = Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [];
    const current = users.find((user) => user.userId === userId);

    if (!current) {
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, message: '用户不存在' }));
      return;
    }

    if (current.userId === adminUser.userId && body.status === 'disabled') {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, message: '不能停用当前登录账号' }));
      return;
    }

    if (
      current.userId === adminUser.userId &&
      Array.isArray(body.allowedMenuKeys) &&
      !normalizeAllowedMenuKeys(body.allowedMenuKeys, body.role ?? current.role).includes(menuKeys.accountManagement)
    ) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, message: '不能移除当前账号的账号管理权限' }));
      return;
    }

    const passwordChanged = Boolean(String(body.password ?? ''));
    const next = {
      ...normalizeUserPayload(body, current),
      passwordHash: passwordChanged ? hashPassword(body.password) : current.passwordHash,
      passwordUpdatedAt: passwordChanged ? nowIso() : current.passwordUpdatedAt ?? '',
      forceChangePassword: current.forceChangePassword ?? false,
    };
    writeJsonFile('users', users.map((user) => user.userId === userId ? next : user));
    writeUserPermission(next.userId, body, next.role);
    res.end(JSON.stringify({ success: true, user: toPublicUser(next) }));
    return;
  }

  if (pathname.startsWith('/users/') && pathname.endsWith('/reset-password') && req.method === 'POST') {
    if (!requireAdmin(req, res)) {
      return;
    }

    const userId = decodeURIComponent(pathname.replace('/users/', '').replace('/reset-password', ''));
    const users = Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [];
    const current = users.find((user) => user.userId === userId);

    if (!current) {
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, message: '用户不存在' }));
      return;
    }

    const updatedAt = nowIso();
    const next = {
      ...current,
      passwordHash: hashPassword(defaultPassword),
      passwordUpdatedAt: updatedAt,
      forceChangePassword: true,
      updatedAt,
    };
    writeJsonFile('users', users.map((user) => user.userId === userId ? next : user));
    res.end(JSON.stringify({ success: true, user: toPublicUser(next) }));
    return;
  }

  if (pathname.startsWith('/users/') && req.method === 'DELETE') {
    const adminUser = requireAdmin(req, res);
    if (!adminUser) {
      return;
    }

    const userId = decodeURIComponent(pathname.replace('/users/', ''));
    const users = Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [];
    const current = users.find((user) => user.userId === userId);

    if (!current) {
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, message: '用户不存在' }));
      return;
    }

    if (current.username === 'admin' || current.userId === 'user-admin') {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, message: '默认管理员账号不能删除' }));
      return;
    }

    if (current.userId === adminUser.userId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, message: '不能删除当前登录账号' }));
      return;
    }

    writeJsonFile('users', users.filter((user) => user.userId !== userId));
    removeUserPermission(userId);
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (next) {
    next();
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ success: false, message: 'Not found' }));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultTaskSuggestionTemplates() {
  const defaults = [
    {
      id: 'suggestion-traffic',
      name: '流量下降处理建议',
      problemType: 'traffic',
      sortWeight: 10,
      content: [
        '建议处理：',
        '1. 检查商品是否下架、限流、活动结束或曝光入口变化。',
        '2. 对比近 7 日主图、标题、价格、活动报名是否有调整。',
        '3. 查看店铺内其他商品流量是否同步下降，判断是单品问题还是店铺整体问题。',
        '4. 处理后继续观察 1-2 天流量恢复情况，并记录采取的动作。',
      ].join('\n'),
    },
    {
      id: 'suggestion-conversion',
      name: '转化下降处理建议',
      problemType: 'conversion',
      sortWeight: 20,
      content: [
        '建议处理：',
        '1. 优先检查价格、优惠、运费、库存、评价和详情页信息。',
        '2. 对比流量是否正常；若流量正常但转化下降，重点排查购买决策因素。',
        '3. 查看高访客低成交商品，确认是否存在价格竞争力或页面承接问题。',
        '4. 处理后记录调整项，并观察转化率是否回升。',
      ].join('\n'),
    },
    {
      id: 'suggestion-deal',
      name: '成交下降处理建议',
      problemType: 'deal',
      sortWeight: 30,
      content: [
        '建议处理：',
        '1. 同时检查流量和转化，判断成交下降由曝光减少还是购买转化变差引起。',
        '2. 若流量下降，先按流量问题处理；若流量正常，重点检查价格、库存、评价和活动。',
        '3. 核对是否有平台活动结束、商品状态变化或售后负面影响。',
        '4. 处理后填写具体动作和结果，便于复盘成交恢复情况。',
      ].join('\n'),
    },
    {
      id: 'suggestion-opportunity',
      name: '增长机会处理建议',
      problemType: 'opportunity',
      sortWeight: 40,
      content: [
        '建议处理：',
        '1. 先确认增长来源：活动、价格、曝光、主图或商品供给是否有变化。',
        '2. 检查库存、价格和履约能力，避免增长期断货或转化承接不足。',
        '3. 提炼可复用动作，观察同类商品或同店铺其他商品是否可复制。',
        '4. 记录本次跟进动作和观察结果，便于后续复盘增长原因。',
      ].join('\n'),
    },
  ];
  const time = nowIso();

  return defaults.map((item) => ({
    ...item,
    enabled: true,
    createdAt: time,
    updatedAt: time,
  }));
}

function normalizeStorePayload(payload, current) {
  const time = nowIso();
  const storeName = String(payload.storeName ?? current?.storeName ?? '').trim();

  if (!storeName) {
    throw new Error('storeName is required');
  }

  return {
    ...current,
    id: current?.id ?? payload.id ?? createId('store'),
    storeName,
    platform: ['TEMU', '1688', 'Amazon', 'TikTok', 'Shopify', 'Other'].includes(payload.platform)
      ? payload.platform
      : current?.platform ?? 'TEMU',
    platformStoreId: String(payload.platformStoreId ?? current?.platformStoreId ?? '').trim(),
    siteCountry: String(payload.siteCountry ?? current?.siteCountry ?? payload.country ?? current?.country ?? '').trim(),
    storeGroup: String(payload.storeGroup ?? current?.storeGroup ?? payload.groupName ?? current?.groupName ?? '').trim(),
    country: String(payload.country ?? current?.country ?? '').trim(),
    status: ['active', 'inactive', 'disabled', 'paused', 'closed'].includes(payload.status) ? payload.status : current?.status ?? 'active',
    groupName: String(payload.groupName ?? current?.groupName ?? '').trim(),
    remark: String(payload.remark ?? current?.remark ?? '').trim(),
    createdAt: current?.createdAt ?? payload.createdAt ?? time,
    updatedAt: time,
  };
}

function getStores() {
  const stores = readJsonFile('stores');

  if (Array.isArray(stores) && stores.length > 0) {
    return stores;
  }

  const relations = readJsonFile('storeOperatorRelations');
  const time = nowIso();
  const storeMap = new Map();

  if (Array.isArray(relations)) {
    for (const relation of relations) {
      if (!relation?.storeName && !relation?.storeId) {
        continue;
      }

      const storeName = String(relation.storeName || relation.storeId).trim();
      const id = String(relation.storeId || storeName).trim();
      storeMap.set(id, {
        id,
        storeName,
        platform: String(relation.platform ?? 'TEMU'),
        platformStoreId: '',
        siteCountry: '',
        storeGroup: '',
        country: '',
        status: 'active',
        groupName: '',
        remark: '',
        createdAt: time,
        updatedAt: time,
      });
    }
  }

  const migratedStores = Array.from(storeMap.values());

  if (migratedStores.length > 0) {
    writeJsonFile('stores', migratedStores);
  }

  return migratedStores;
}

function getOperators() {
  const operators = readJsonFile('operators');

  if (Array.isArray(operators) && operators.length > 0) {
    return operators.map((operator) => ({
      ...operator,
      operatorName: operator.operatorName ?? operator.name ?? '',
      groupName: operator.groupName ?? '',
      level: operator.level ?? '',
      status: operator.status ?? 'active',
      remark: operator.remark ?? '',
    }));
  }

  const relations = readJsonFile('storeOperatorRelations');
  const time = nowIso();
  const operatorMap = new Map();

  if (Array.isArray(relations)) {
    for (const relation of relations) {
      if (!relation?.operatorName && !relation?.operatorId) {
        continue;
      }

      const operatorName = String(relation.operatorName || relation.operatorId).trim();
      const id = String(relation.operatorId || `operator-${operatorName}`).trim();
      operatorMap.set(id, {
        id,
        operatorName,
        groupName: '',
        level: '',
        status: 'active',
        remark: '',
        createdAt: time,
        updatedAt: time,
      });
    }
  }

  const migratedOperators = Array.from(operatorMap.values());

  if (migratedOperators.length > 0) {
    writeJsonFile('operators', migratedOperators);
  }

  return migratedOperators;
}

function normalizeRelationPayload(payload, current) {
  const time = nowIso();
  const rawRole = String(payload.role ?? current?.role ?? '').trim();
  const role = ['primary', 'assistant', 'temporary'].includes(rawRole) ? rawRole : 'primary';
  const status = ['active', 'inactive'].includes(payload.status)
    ? payload.status
    : ['active', 'inactive'].includes(current?.status)
      ? current.status
      : 'active';

  return {
    ...current,
    ...payload,
    id: current?.id ?? payload.id ?? createId('relation'),
    storeId: String(payload.storeId ?? current?.storeId ?? payload.storeName ?? current?.storeName ?? '').trim(),
    operatorId: String(payload.operatorId ?? current?.operatorId ?? '').trim(),
    role,
    platform: String(payload.platform ?? current?.platform ?? 'TEMU').trim() || 'TEMU',
    startDate: String(payload.startDate ?? current?.startDate ?? '').trim(),
    endDate: String(payload.endDate ?? current?.endDate ?? '').trim(),
    status,
    remark: String(payload.remark ?? current?.remark ?? '').trim(),
    createdAt: current?.createdAt ?? payload.createdAt ?? time,
    updatedAt: time,
  };
}

function findTaskAssignee(storeId, storeName) {
  const storeKey = String(storeId || storeName || '').trim();
  if (!storeKey) {
    return null;
  }

  const relation = readCollection('storeOperatorRelations')
    .find((item) => item.status !== 'inactive' && (item.storeId === storeKey || item.storeName === storeKey));
  const operator = relation?.operatorId ? getOperators().find((item) => item.id === relation.operatorId) : null;

  return relation ? {
    operatorId: relation.operatorId || operator?.id || '',
    operatorName: relation.operatorName || operator?.operatorName || '',
  } : null;
}

function findTaskStore(storeId, storeName) {
  const storeKey = String(storeId || storeName || '').trim();
  if (!storeKey) {
    return null;
  }

  return getStores().find((store) => store.id === storeKey || store.storeName === storeKey) ?? null;
}

function firstNonBlank(...values) {
  return String(values.find((value) => String(value ?? '').trim()) ?? '').trim();
}

function normalizeTaskPayload(payload, current) {
  const time = nowIso();
  const isReadNormalization = Boolean(current) && payload === current;
  const title = String(payload.title ?? current?.title ?? '').trim();
  const storeName = String(payload.storeName ?? current?.storeName ?? '').trim();
  const storeId = firstNonBlank(payload.storeId, current?.storeId);
  const store = findTaskStore(storeId, storeName);
  const assignee = findTaskAssignee(storeId, storeName);
  const sourceType = ['manual', 'warning', 'opportunity', 'risk_warning', 'operation_anomaly', 'growth_opportunity'].includes(payload.sourceType)
    ? payload.sourceType
    : current?.sourceType ?? 'manual';
  const priority = ['high', 'medium', 'low'].includes(payload.priority)
    ? payload.priority
    : current?.priority ?? 'medium';
  const status = ['todo', 'doing', 'done', 'closed'].includes(payload.status)
    ? payload.status
    : current?.status ?? 'todo';
  const reviewStatus = ['none', 'improved', 'watching', 'not_improved', 'unknown'].includes(payload.reviewStatus)
    ? payload.reviewStatus
    : current?.reviewStatus ?? 'none';
  const wasCompleted = current?.status === 'done' || current?.status === 'closed';
  const isCompleted = status === 'done' || status === 'closed';
  const completedAt = isReadNormalization
    ? current?.completedAt ?? ''
    : isCompleted
      ? current?.completedAt || time
      : wasCompleted
        ? ''
        : current?.completedAt ?? '';

  if (!title) {
    throw new Error('title is required');
  }

  return {
    ...current,
    ...payload,
    id: current?.id ?? payload.id ?? createId('task'),
    title,
    platform: firstNonBlank(payload.platform, current?.platform, store?.platform),
    storeId,
    storeName,
    operatorId: firstNonBlank(payload.operatorId, current?.operatorId, assignee?.operatorId),
    operatorName: firstNonBlank(payload.operatorName, current?.operatorName, assignee?.operatorName),
    sourceType,
    sourceId: String(payload.sourceId ?? current?.sourceId ?? '').trim(),
    sourceContent: String(payload.sourceContent ?? current?.sourceContent ?? '').trim(),
    suggestion: String(payload.suggestion ?? current?.suggestion ?? '').trim(),
    priority,
    status,
    dueDate: String(payload.dueDate ?? current?.dueDate ?? '').trim(),
    resultNote: String(payload.resultNote ?? current?.resultNote ?? '').trim(),
    reviewStatus,
    reviewNote: String(payload.reviewNote ?? current?.reviewNote ?? '').trim(),
    reviewedAt: reviewStatus !== 'none'
      ? payload.reviewedAt ?? current?.reviewedAt ?? time
      : '',
    createdAt: current?.createdAt ?? payload.createdAt ?? time,
    updatedAt: isReadNormalization ? current?.updatedAt ?? time : time,
    completedAt,
  };
}

function normalizeTaskSuggestionTemplatePayload(payload, current) {
  const time = nowIso();
  const name = String(payload.name ?? current?.name ?? '').trim();
  const content = String(payload.content ?? current?.content ?? '').trim();
  const problemType = ['traffic', 'conversion', 'deal', 'opportunity'].includes(payload.problemType)
    ? payload.problemType
    : current?.problemType ?? 'traffic';

  if (!name) {
    throw new Error('name is required');
  }

  if (!content) {
    throw new Error('content is required');
  }

  return {
    ...current,
    ...payload,
    id: current?.id ?? payload.id ?? createId('suggestion'),
    name,
    problemType,
    content,
    enabled: typeof payload.enabled === 'boolean' ? payload.enabled : current?.enabled ?? true,
    sortWeight: Number.isFinite(Number(payload.sortWeight ?? current?.sortWeight))
      ? Number(payload.sortWeight ?? current?.sortWeight)
      : 0,
    createdAt: current?.createdAt ?? payload.createdAt ?? time,
    updatedAt: payload === current ? current?.updatedAt ?? time : time,
  };
}

function readCollection(name) {
  const value = readJsonFile(name);

  if (!Array.isArray(value)) {
    return [];
  }

  if (name === 'tasks') {
    let changed = false;
    const next = value.map((item) => {
      const normalized = normalizeTaskPayload(item, item);
      changed = changed || JSON.stringify(normalized) !== JSON.stringify(item);
      return normalized;
    });

    if (changed) {
      writeJsonFile(name, next);
    }

    return next;
  }

  if (name === 'taskSuggestionTemplates') {
    const templates = value.length > 0 ? value : getDefaultTaskSuggestionTemplates();
    let changed = value.length === 0;
    const next = templates.map((item) => {
      const normalized = normalizeTaskSuggestionTemplatePayload(item, item);
      changed = changed || JSON.stringify(normalized) !== JSON.stringify(item);
      return normalized;
    });

    if (changed) {
      writeJsonFile(name, next);
    }

    return next;
  }

  if (name !== 'storeOperatorRelations') {
    return value;
  }

  let changed = false;
  const next = value.map((item) => {
    const normalized = normalizeRelationPayload(item, item);
    changed = changed || JSON.stringify(normalized) !== JSON.stringify(item);
    return normalized;
  });

  if (changed) {
    writeJsonFile(name, next);
  }

  return next;
}

async function handleCollectionApi(req, res, name, prefix) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const menuKey = getCollectionMenuKey(name);
    if (menuKey && !requireMenu(req, res, menuKey)) {
      return;
    }

    if (req.method === 'GET') {
      const data = name === 'stores' ? getStores() : name === 'operators' ? getOperators() : readCollection(name);
      res.end(JSON.stringify(filterCollectionForUser(name, data, toCurrentUser(findCurrentUser(req)))));
      return;
    }

    const id = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\/+/, ''));
    const collection = readCollection(name);
    const currentUser = toCurrentUser(findCurrentUser(req));

    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (name === 'stores') {
        const next = normalizeStorePayload(body);
        writeJsonFile(name, [...getStores(), next]);
        res.end(JSON.stringify(next));
        return;
      }

      const next = name === 'storeOperatorRelations'
        ? normalizeRelationPayload(body)
        : name === 'tasks'
          ? normalizeTaskPayload(body)
        : name === 'taskSuggestionTemplates'
          ? normalizeTaskSuggestionTemplatePayload(body)
        : name === 'operators'
          ? {
              ...body,
              id: body.id || createId(prefix),
              operatorName: String(body.operatorName ?? body.name ?? '').trim(),
              groupName: String(body.groupName ?? '').trim(),
              level: String(body.level ?? '').trim(),
              status: ['active', 'inactive'].includes(body.status) ? body.status : 'active',
              remark: String(body.remark ?? '').trim(),
              createdAt: body.createdAt || nowIso(),
              updatedAt: nowIso(),
            }
        : { ...body, id: body.id || createId(prefix), createdAt: body.createdAt || nowIso(), updatedAt: nowIso() };
      writeJsonFile(name, [...collection, next]);
      res.end(JSON.stringify(next));
      return;
    }

    if (req.method === 'PUT' && id) {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (name === 'stores') {
        const stores = getStores();
        const current = stores.find((item) => item.id === id);

        if (!current) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        const next = normalizeStorePayload(body, current);
        writeJsonFile(name, stores.map((item) => item.id === id ? next : item));
        res.end(JSON.stringify(next));
        return;
      }

      const current = collection.find((item) => item.id === id);

      if (!current) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      if (name === 'tasks' && currentUser?.role !== 'admin' && !itemMatchesVisibleTask(current, getVisibleStoreKeys(currentUser), currentUser)) {
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, message: '无权编辑该任务' }));
        return;
      }

      if (name === 'tasks' && body.status === 'closed' && currentUser?.role !== 'admin') {
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, message: '普通运营无权关闭任务' }));
        return;
      }

      const updateBody = name === 'tasks' && currentUser?.role !== 'admin'
        ? {
            status: body.status,
            resultNote: body.resultNote,
            reviewStatus: body.reviewStatus,
            reviewNote: body.reviewNote,
          }
        : body;
      const next = name === 'storeOperatorRelations'
        ? normalizeRelationPayload(updateBody, current)
        : name === 'tasks'
          ? normalizeTaskPayload(updateBody, current)
        : name === 'taskSuggestionTemplates'
          ? normalizeTaskSuggestionTemplatePayload(updateBody, current)
        : name === 'operators'
          ? {
              ...current,
              ...updateBody,
              id,
              operatorName: String(updateBody.operatorName ?? updateBody.name ?? current.operatorName ?? current.name ?? '').trim(),
              groupName: String(updateBody.groupName ?? current.groupName ?? '').trim(),
              level: String(updateBody.level ?? current.level ?? '').trim(),
              status: ['active', 'inactive'].includes(updateBody.status) ? updateBody.status : current.status ?? 'active',
              remark: String(updateBody.remark ?? current.remark ?? '').trim(),
              updatedAt: nowIso(),
            }
        : { ...current, ...updateBody, id, updatedAt: nowIso() };
      writeJsonFile(name, collection.map((item) => item.id === id ? next : item));
      res.end(JSON.stringify(next));
      return;
    }

    if (req.method === 'DELETE' && id) {
      if (name === 'tasks' && currentUser?.role !== 'admin') {
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, message: '普通运营无权删除任务' }));
        return;
      }

      writeJsonFile(name, (name === 'stores' ? getStores() : collection).filter((item) => item.id !== id));
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.statusCode = 405;
    res.end('Method not allowed');
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
  });
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeCurrentUser(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value;
}

function readCurrentUser(req) {
  const requestUrl = new URL(req.url ?? '/', 'http://local');
  const sessionUser = toCurrentUser(findCurrentUser(req));

  if (sessionUser) {
    return sessionUser;
  }

  const currentUserText = requestUrl.searchParams.get('currentUser');

  if (currentUserText) {
    try {
      return normalizeCurrentUser(JSON.parse(currentUserText));
    } catch {
      return null;
    }
  }

  return normalizeCurrentUser({
    role: requestUrl.searchParams.get('role') || undefined,
    id: requestUrl.searchParams.get('id') || undefined,
    userId: requestUrl.searchParams.get('userId') || undefined,
    username: requestUrl.searchParams.get('username') || undefined,
    account: requestUrl.searchParams.get('account') || undefined,
    name: requestUrl.searchParams.get('name') || undefined,
    operatorId: requestUrl.searchParams.get('operatorId') || undefined,
    operatorName: requestUrl.searchParams.get('operatorName') || undefined,
    teamId: requestUrl.searchParams.get('teamId') || undefined,
    groupName: requestUrl.searchParams.get('groupName') || undefined,
  });
}

function getUserKeys(currentUser) {
  return unique([
    currentUser?.operatorId,
    currentUser?.operatorName,
    currentUser?.id,
    currentUser?.userId,
    currentUser?.username,
    currentUser?.account,
    currentUser?.name,
  ].map((value) => String(value ?? '').trim()));
}

function relationMatchesOperator(relation, operatorKeys) {
  return operatorKeys.includes(String(relation?.operatorId ?? '').trim()) ||
    operatorKeys.includes(String(relation?.operatorName ?? '').trim());
}

function getStoreIdFromRelation(relation) {
  return String(relation?.storeId || relation?.storeName || '').trim();
}

function getAllowedStoreIds(currentUser) {
  return Array.isArray(currentUser?.allowedStoreIds)
    ? unique(currentUser.allowedStoreIds.map((item) => String(item ?? '').trim()))
    : [];
}

function getVisibleStoreIds(currentUser) {
  const stores = getStores();
  const relations = readCollection('storeOperatorRelations');
  const role = String(currentUser?.role ?? '').toLowerCase();
  const activeRelations = relations.filter((relation) => relation.status !== 'inactive');

  if (role === 'admin') {
    return unique(stores.map((store) => store.id || store.storeName));
  }

  if (role === 'operator' || role === 'leader') {
    const allowedStoreIds = getAllowedStoreIds(currentUser);
    if (allowedStoreIds.length > 0) {
      return allowedStoreIds;
    }

    const operatorKeys = getUserKeys(currentUser);

    return unique(activeRelations
      .filter((relation) => relationMatchesOperator(relation, operatorKeys))
      .map(getStoreIdFromRelation));
  }

  return [];
}

function getVisibleStores(currentUser) {
  const stores = getStores();
  const storeIds = getVisibleStoreIds(currentUser);
  const storeIdSet = new Set(storeIds);

  return stores.filter((store) => storeIdSet.has(store.id) || storeIdSet.has(store.storeName));
}

function getVisibleStoreKeys(currentUser) {
  return new Set(getVisibleStores(currentUser).flatMap((store) => [store.id, store.storeName].filter(Boolean)));
}

function normalizeSearchText(value) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase();
}

function itemMatchesVisibleStore(item, visibleStoreKeys) {
  return visibleStoreKeys.has(String(item?.storeId ?? '').trim()) ||
    visibleStoreKeys.has(String(item?.storeName ?? '').trim());
}

function itemMatchesVisibleTask(item, visibleStoreKeys, currentUser) {
  const operatorKeys = new Set(getUserKeys(currentUser));
  return itemMatchesVisibleStore(item, visibleStoreKeys) ||
    operatorKeys.has(String(item?.operatorId ?? '').trim()) ||
    operatorKeys.has(String(item?.operatorName ?? '').trim());
}

function getStoreKeysFromItems(items) {
  return unique((items ?? []).flatMap((item) => [
    String(item?.storeId ?? '').trim(),
    String(item?.storeName ?? '').trim(),
  ]));
}

function getImportStoreKeys(name, data) {
  if (name === 'orderImportStore') {
    return getStoreKeysFromItems((data?.batches ?? []).flatMap((batch) => batch.orders ?? []));
  }

  if (name === 'trafficConversionStore') {
    return getStoreKeysFromItems([...(data?.records ?? []), ...(data?.batches ?? [])]);
  }

  return [];
}

function assertTrafficImportSearchText(searchableText, currentUser) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return;
  }

  const authorizedStores = getVisibleStores(currentUser);
  if (authorizedStores.length === 0) {
    throw new Error('当前账号未配置可导入店铺，请联系管理员。');
  }

  const authorizedKeys = new Set(authorizedStores.flatMap((store) => [store.id, store.storeName].filter(Boolean)));
  const searchable = normalizeSearchText(searchableText);
  const blockedStores = getStores()
    .filter((store) => !authorizedKeys.has(store.id) && !authorizedKeys.has(store.storeName))
    .filter((store) => store.storeName && searchable.includes(normalizeSearchText(store.storeName)))
    .map((store) => store.storeName);

  if (blockedStores.length > 0) {
    throw new Error(`导入失败：当前文件包含未授权店铺【${unique(blockedStores).join('、')}】，请重新检查文件。`);
  }
}

function assertCanWriteImportData(name, data, currentUser, searchableText = '') {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin' || !['orderImportStore', 'trafficConversionStore'].includes(name)) {
    return;
  }

  if (name === 'trafficConversionStore') {
    assertTrafficImportSearchText(searchableText, currentUser);
  }

  const visibleStoreKeys = getVisibleStoreKeys(currentUser);
  if (visibleStoreKeys.size === 0) {
    throw new Error('当前账号未配置可导入店铺，请联系管理员。');
  }

  const blockedStore = getImportStoreKeys(name, data).find((storeKey) => !visibleStoreKeys.has(storeKey));

  if (blockedStore) {
    throw new Error('当前账号无权导入该店铺数据');
  }
}

function mergeVisibleImportData(name, incoming, currentUser) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin' || !['orderImportStore', 'trafficConversionStore'].includes(name)) {
    return incoming;
  }

  const existing = readJsonFile(name);
  const visibleStoreKeys = getVisibleStoreKeys(currentUser);

  if (name === 'orderImportStore') {
    const hiddenBatches = (existing?.batches ?? []).map((batch) => ({
      ...batch,
      orders: (batch.orders ?? []).filter((order) => !itemMatchesVisibleStore(order, visibleStoreKeys)),
    })).filter((batch) => batch.orders.length > 0);

    return { ...incoming, batches: [...hiddenBatches, ...(incoming?.batches ?? [])] };
  }

  return {
    ...incoming,
    records: [
      ...(existing?.records ?? []).filter((record) => !itemMatchesVisibleStore(record, visibleStoreKeys)),
      ...(incoming?.records ?? []),
    ],
    batches: [
      ...(existing?.batches ?? []).filter((batch) => !itemMatchesVisibleStore(batch, visibleStoreKeys)),
      ...(incoming?.batches ?? []),
    ],
  };
}

function filterCollectionForUser(name, data, currentUser) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return data;
  }

  const visibleStoreKeys = getVisibleStoreKeys(currentUser);

  if (name === 'stores') {
    return getVisibleStores(currentUser);
  }

  if (name === 'tasks') {
    return Array.isArray(data) ? data.filter((item) => itemMatchesVisibleTask(item, visibleStoreKeys, currentUser)) : data;
  }

  if (name === 'storeOperatorRelations') {
    return Array.isArray(data) ? data.filter((item) => itemMatchesVisibleStore(item, visibleStoreKeys)) : data;
  }

  return data;
}

function filterPersistentDataForUser(name, data, currentUser) {
  if (!currentUser && ['orderImportStore', 'trafficConversionStore', 'trafficWarningRules', 'riskResults', 'growthOpportunities', 'businessAnalysisItems'].includes(name)) {
    return data;
  }

  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return data;
  }

  const visibleStoreKeys = getVisibleStoreKeys(currentUser);

  if (name === 'orderImportStore' && data?.batches) {
    return {
      ...data,
      batches: data.batches.map((batch) => ({
        ...batch,
        orders: (batch.orders ?? []).filter((order) => itemMatchesVisibleStore(order, visibleStoreKeys)),
      })).filter((batch) => batch.orders.length > 0),
    };
  }

  if (name === 'trafficConversionStore') {
    return {
      ...data,
      records: (data?.records ?? []).filter((record) => itemMatchesVisibleStore(record, visibleStoreKeys)),
      batches: (data?.batches ?? []).filter((batch) => itemMatchesVisibleStore(batch, visibleStoreKeys)),
    };
  }

  if (['orderDailySummary', 'trafficDailySummary', 'riskResults', 'growthOpportunities', 'businessAnalysisItems'].includes(name)) {
    return {
      ...data,
      items: (data?.items ?? []).filter((item) => itemMatchesVisibleStore(item, visibleStoreKeys)),
    };
  }

  return data;
}

function getCollectionMenuKey(name) {
  if (name === 'stores') {
    return menuKeys.storeManagement;
  }

  if (name === 'operators' || name === 'storeOperatorRelations') {
    return menuKeys.operatorManagement;
  }

  if (name === 'tasks') {
    return menuKeys.operationTasks;
  }

  if (String(name).startsWith('salary') || name === 'employeeSalaryPlans') {
    return menuKeys.salaryPerformance;
  }

  return '';
}

function getPersistentMenuKey(name) {
  if (String(name).startsWith('salary') || name === 'employeeSalaryPlans') {
    return menuKeys.salaryPerformance;
  }

  return '';
}

function handleVisibleStoresApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  try {
    const currentUser = readCurrentUser(req);
    const storeIds = getVisibleStoreIds(currentUser);
    const stores = getVisibleStores(currentUser);
    const role = String(currentUser?.role ?? '').toLowerCase();
    const message = role !== 'admin' && storeIds.length === 0 ? '当前用户暂未绑定可见店铺' : undefined;

    res.end(JSON.stringify({ success: true, storeIds, stores, message }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({
      success: false,
      storeIds: [],
      stores: [],
      message: error instanceof Error ? error.message : String(error),
    }));
  }
}

function getAiRuntimeStatus() {
  const provider = process.env.AI_PROVIDER === 'openai' && process.env.OPENAI_API_KEY ? 'openai' : 'mock';

  return {
    provider,
    configuredProvider: process.env.AI_PROVIDER || 'mock',
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

function logAiProxyEvent(event, details = {}) {
  console.log('[ai-proxy]', JSON.stringify({
    event,
    provider: getAiRuntimeStatus().provider,
    ...details,
  }));
}

function buildMockAiAdviceResponse(request, reason = 'mock fallback') {
  const context = request.context ?? {};
  const summary = context.anomalySummary ?? {};
  const formalCount = (summary.criticalCount ?? 0) + (summary.warningCount ?? 0);
  const storeNames = unique((context.storeSnapshots ?? []).map((snapshot) => snapshot.storeName));
  const metricNames = unique((context.anomalies ?? []).map((anomaly) => anomaly.metricName));
  const dataQualityNotes = context.dataQualityNotes ?? [];
  const keyReasons = (context.possibleReasons ?? []).slice(0, 5);
  const recommendedActions = (context.recommendedActions ?? []).slice(0, 5);
  const riskNotes = [...dataQualityNotes, `服务端使用 mock：${reason}`];

  return {
    requestId: `server-mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    provider: 'mock-gpt',
    model: 'mock-operation-advice-v1',
    generatedAt: new Date().toISOString(),
    summary: dataQualityNotes.length > 0
      ? 'Mock GPT 判断：当前先以数据质量校验和口径补齐为第一优先级，再推进异常归因。'
      : 'Mock GPT 判断：当前建议按核心指标和高影响店铺优先处理。',
    problemOverview: [
      `当前识别到 ${summary.total ?? 0} 个异常/观察项，其中正式异常 ${formalCount} 个，观察项 ${summary.watchCount ?? 0} 个。`,
      `涉及店铺：${storeNames.slice(0, 5).join('、') || context.storeName || '未识别店铺'}。`,
      `主要指标：${metricNames.slice(0, 6).join('、') || '暂无明确指标'}。`,
    ],
    keyReasons,
    recommendedActions,
    bossAttentionAdvice: formalCount > 0 ? '建议同步老板当前正式异常数量、影响店铺和处理责任人。' : '暂不需要老板介入，运营侧先完成自查。',
    taskCreationAdvice: formalCount > 0 ? '建议为正式异常生成任务并跟进闭环。' : '暂不建议批量生成任务。',
    riskNotes: riskNotes.length > 0 ? riskNotes : ['暂无额外风险提示。'],
    rawText: [
      '1. 问题概况',
      `- 当前共发现 ${summary.total ?? 0} 个异常/观察项`,
      `- 其中观察项 ${summary.watchCount ?? 0} 个，正式异常 ${formalCount} 个`,
      '',
      '2. 建议动作',
      ...(recommendedActions.length > 0 ? recommendedActions.map((action) => `- ${action.actionName}`) : ['- 暂无推荐动作']),
    ].join('\n'),
  };
}

function buildAiSuggestionPrompt(request) {
  return [
    '你是 TEMU 运营数据诊断助手。请基于用户提供的 AiAdviceRequest JSON 输出运营建议。',
    '必须只返回 JSON，不要返回 Markdown。',
    'JSON 字段必须包含：summary, problemOverview, keyReasons, recommendedActions, bossAttentionAdvice, taskCreationAdvice, riskNotes, rawText。',
    'keyReasons 使用输入 context.possibleReasons 中的对象结构，recommendedActions 使用输入 context.recommendedActions 中的对象结构。',
    'problemOverview 和 riskNotes 必须是字符串数组。',
    'rawText 是可复制给老板/运营的中文建议文本。',
    '',
    JSON.stringify(request),
  ].join('\n');
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function normalizeAiAdviceResponse(value, request, model) {
  const parsed = typeof value === 'string' ? parseJsonObject(value) : value;

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  if (
    typeof parsed.summary !== 'string' ||
    !Array.isArray(parsed.problemOverview) ||
    !Array.isArray(parsed.keyReasons) ||
    !Array.isArray(parsed.recommendedActions) ||
    typeof parsed.bossAttentionAdvice !== 'string' ||
    typeof parsed.taskCreationAdvice !== 'string' ||
    !Array.isArray(parsed.riskNotes) ||
    typeof parsed.rawText !== 'string'
  ) {
    return null;
  }

  return {
    requestId: `openai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    provider: 'openai-gpt',
    model,
    generatedAt: new Date().toISOString(),
    summary: parsed.summary,
    problemOverview: parsed.problemOverview.filter((item) => typeof item === 'string'),
    keyReasons: parsed.keyReasons,
    recommendedActions: parsed.recommendedActions,
    bossAttentionAdvice: parsed.bossAttentionAdvice,
    taskCreationAdvice: parsed.taskCreationAdvice,
    riskNotes: parsed.riskNotes.filter((item) => typeof item === 'string'),
    rawText: parsed.rawText,
  };
}

async function requestOpenAiAdvice(request, prompt) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '你只返回 JSON。' },
        { role: 'user', content: prompt || buildAiSuggestionPrompt(request) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const normalized = normalizeAiAdviceResponse(content, request, model);

  if (!normalized) {
    throw new Error('OpenAI response parse failed');
  }

  return normalized;
}

function localDataPlugin() {
  const plugin = {
    name: 'local-data-storage',
    configureServer(server) {
      server.middlewares.use('/api/data-path', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (!requireMenu(_req, res, menuKeys.dataSource)) {
          return;
        }

        res.end(JSON.stringify({ path: dataDir }));
      });

      server.middlewares.use('/api/auth', (req, res, next) => {
        handleAuthApi(req, res, next);
      });

      server.middlewares.use('/api/data-backup', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');

        try {
          if (!requireMenu(_req, res, menuKeys.dataCenter)) {
            return;
          }

          if (_req.method === 'GET') {
            res.end(JSON.stringify({ ok: true, backups: listBackups() }));
            return;
          }

          if (_req.method === 'POST') {
            res.end(JSON.stringify({ ok: true, ...backupDataFiles() }));
            return;
          }

          if (_req.method === 'DELETE') {
            const name = decodeURIComponent((_req.url ?? '').replace(/^\/+/, ''));
            res.end(JSON.stringify({ ok: true, ...deleteBackup(name) }));
            return;
          }

          res.statusCode = 405;
          res.end('Method not allowed');
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      });

      server.middlewares.use('/api/ai/status', (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');

        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        res.end(JSON.stringify(getAiRuntimeStatus()));
      });

      server.middlewares.use('/api/ai/operation-advice', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        try {
          const payload = JSON.parse(await readBody(req) || '{}');
          const request = payload.request ?? payload;
          const prompt = payload.prompt;
          const canUseOpenAi = process.env.AI_PROVIDER === 'openai' && Boolean(process.env.OPENAI_API_KEY);

          if (!canUseOpenAi) {
            const fallback = buildMockAiAdviceResponse(request, 'AI_PROVIDER 不是 openai 或缺少 OPENAI_API_KEY');
            logAiProxyEvent('fallback', { requestId: fallback.requestId, reason: 'not_configured' });
            res.end(JSON.stringify(fallback));
            return;
          }

          try {
            const response = await requestOpenAiAdvice(request, prompt);
            logAiProxyEvent('openai_success', { requestId: response.requestId, model: response.model });
            res.end(JSON.stringify(response));
          } catch (error) {
            const fallback = buildMockAiAdviceResponse(
              request,
              error instanceof Error ? error.message : String(error),
            );
            logAiProxyEvent('fallback', {
              requestId: fallback.requestId,
              reason: error instanceof Error ? error.message : String(error),
            });
            res.end(JSON.stringify(fallback));
          }
        } catch (error) {
          res.statusCode = 500;
          logAiProxyEvent('bad_request', {
            reason: error instanceof Error ? error.message : String(error),
          });
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      });

      server.middlewares.use('/api/auth/visible-stores', handleVisibleStoresApi);
      server.middlewares.use('/api/stores', (req, res) => handleCollectionApi(req, res, 'stores', 'store'));
      server.middlewares.use('/api/operators', (req, res) => handleCollectionApi(req, res, 'operators', 'operator'));
      server.middlewares.use('/api/tasks', (req, res) => handleCollectionApi(req, res, 'tasks', 'task'));
      server.middlewares.use('/api/task-suggestion-templates', (req, res) => (
        handleCollectionApi(req, res, 'taskSuggestionTemplates', 'suggestion')
      ));
      server.middlewares.use('/api/store-operator-relations', (req, res) => (
        handleCollectionApi(req, res, 'storeOperatorRelations', 'relation')
      ));
      server.middlewares.use('/api/salary/employees', (req, res) => (
        handleCollectionApi(req, res, 'salaryEmployees', 'employee')
      ));
      server.middlewares.use('/api/salary/periods', (req, res) => (
        handleCollectionApi(req, res, 'salaryPeriods', 'period')
      ));
      server.middlewares.use('/api/salary/attendance-records', (req, res) => (
        handleCollectionApi(req, res, 'salaryAttendanceRecords', 'attendance')
      ));
      server.middlewares.use('/api/salary/attendance-rules', (req, res) => (
        handleCollectionApi(req, res, 'salaryAttendanceRules', 'attendance-rule')
      ));
      server.middlewares.use('/api/salary/piecework-records', (req, res) => (
        handleCollectionApi(req, res, 'salaryPieceworkRecords', 'piecework')
      ));
      server.middlewares.use('/api/salary-plans', (req, res) => (
        handleCollectionApi(req, res, 'salaryPlans', 'salary-plan')
      ));
      server.middlewares.use('/api/salary-items', (req, res) => (
        handleCollectionApi(req, res, 'salaryItems', 'salary-item')
      ));
      server.middlewares.use('/api/employee-salary-plans', (req, res) => (
        handleCollectionApi(req, res, 'employeeSalaryPlans', 'employee-salary-plan')
      ));
      server.middlewares.use('/api/salary-records', (req, res) => (
        handleCollectionApi(req, res, 'salaryRecords', 'salary-record')
      ));

      server.middlewares.use('/api/persistent-data/', async (req, res) => {
        const name = req.url?.split('?')[0].replace(/^\/+/, '');

        if (!name || !(name in dataFiles)) {
          res.statusCode = 404;
          res.setHeader('Cache-Control', 'no-store');
          res.end('Not found');
          return;
        }

        const filePath = ensureDataFile(name);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');

        const menuKey = getPersistentMenuKey(name);
        if (menuKey && !requireMenu(req, res, menuKey)) {
          return;
        }

        if (req.method === 'GET') {
          try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            res.end(JSON.stringify(filterPersistentDataForUser(name, data, toCurrentUser(findCurrentUser(req)))));
          } catch (error) {
            res.statusCode = 500;
            res.end(`Read failed: ${error instanceof Error ? error.message : String(error)}`);
          }
          return;
        }

        if (req.method === 'PUT') {
          try {
            const bodyText = await readBody(req);
            const currentUser = toCurrentUser(findCurrentUser(req));
            const rawParsed = JSON.parse(bodyText || 'null');
            const hasGuardPayload = rawParsed && typeof rawParsed === 'object' && Object.prototype.hasOwnProperty.call(rawParsed, '__payload');
            const parsed = hasGuardPayload ? rawParsed.__payload : rawParsed;
            const searchableText = hasGuardPayload
              ? rawParsed.__trafficImportSearchableText ?? rawParsed.__trafficImportSearchText ?? ''
              : '';
            assertCanWriteImportData(name, parsed, currentUser, searchableText);
            const nextData = mergeVisibleImportData(name, parsed, currentUser);
            fs.writeFileSync(filePath, JSON.stringify(nextData, null, 2), 'utf-8');
            res.end(JSON.stringify({ ok: true, path: filePath }));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            res.statusCode = message === '当前账号无权导入该店铺数据' || message.startsWith('导入失败：') || message.startsWith('当前账号未配置可导入店铺') ? 403 : 500;
            res.end(JSON.stringify({ ok: false, message }));
          }
          return;
        }

        res.statusCode = 405;
        res.setHeader('Cache-Control', 'no-store');
        res.end('Method not allowed');
      });
    },
    configurePreviewServer(server) {
      plugin.configureServer(server);
    },
  };

  return plugin;
}

export default defineConfig({
  plugins: [react(), localDataPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5176,
    strictPort: true,
  },
});

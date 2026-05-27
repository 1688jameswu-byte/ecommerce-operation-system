const apiBase = '/api/persistent-data';
let dataPathLogged = false;

interface WritePersistentOptions {
  trafficImportSearchableText?: string;
  deleteImportData?: boolean;
}

function request(method: string, name: string, body?: unknown): string | null {
  const xhr = new XMLHttpRequest();
  const cacheBust = method === 'GET' ? `?t=${Date.now()}` : '';
  xhr.open(method, `${apiBase}/${name}${cacheBust}`, false);
  xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
  xhr.send(body === undefined ? undefined : JSON.stringify(body));

  if (xhr.status >= 200 && xhr.status < 300) {
    return xhr.responseText;
  }

  if (method === 'PUT') {
    try {
      const data = JSON.parse(xhr.responseText) as { message?: string };
      throw new Error(data.message || `JSON 文件写入失败：${name}`);
    } catch (error) {
      if (error instanceof Error && error.message) {
        throw error;
      }
      throw new Error(xhr.responseText || `JSON 文件写入失败：${name}`);
    }
  }

  return null;
}

async function requestAsync(method: string, name: string, body?: unknown): Promise<string | null> {
  const cacheBust = method === 'GET' ? `?t=${Date.now()}` : '';
  const response = await fetch(`${apiBase}/${name}${cacheBust}`, {
    method,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    credentials: 'include',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.ok) {
    return response.text();
  }

  if (method === 'PUT') {
    const text = await response.text();
    try {
      const data = JSON.parse(text) as { message?: string };
      throw new Error(data.message || `JSON 文件写入失败：${name}`);
    } catch (error) {
      if (error instanceof Error && error.message) {
        throw error;
      }
      throw new Error(text || `JSON 文件写入失败：${name}`);
    }
  }

  return null;
}

export function logPersistentDataPath() {
  if (dataPathLogged || typeof window === 'undefined') {
    return;
  }

  try {
    const user = JSON.parse(window.localStorage.getItem('currentUser') || 'null') as { role?: string; allowedMenuKeys?: string[] } | null;
    if (user?.role !== 'admin' && !(user?.allowedMenuKeys ?? []).includes('data-source')) {
      return;
    }
  } catch {
    return;
  }

  dataPathLogged = true;
  fetch('/api/data-path')
    .then((response) => response.json())
    .then((data: { path: string }) => {
      console.info(`当前后台数据保存路径：${data.path}`);
    })
    .catch(() => {
      console.info('当前后台数据保存路径：Vite 本地服务 /data');
    });
}

export function readPersistentJson<T>(name: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  logPersistentDataPath();

  try {
    const raw = request('GET', name);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writePersistentJson(name: string, value: unknown, options?: WritePersistentOptions) {
  if (typeof window === 'undefined') {
    return;
  }

  logPersistentDataPath();
  request('PUT', name, options?.trafficImportSearchableText || options?.deleteImportData
    ? { __payload: value, __trafficImportSearchableText: options.trafficImportSearchableText, __deleteImportData: options.deleteImportData }
    : value);
}

export async function readPersistentJsonAsync<T>(name: string, fallback: T): Promise<T> {
  if (typeof window === 'undefined') {
    return fallback;
  }

  logPersistentDataPath();

  try {
    const raw = await requestAsync('GET', name);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writePersistentJsonAsync(name: string, value: unknown, options?: WritePersistentOptions) {
  if (typeof window === 'undefined') {
    return;
  }

  logPersistentDataPath();
  await requestAsync('PUT', name, options?.trafficImportSearchableText || options?.deleteImportData
    ? { __payload: value, __trafficImportSearchableText: options.trafficImportSearchableText, __deleteImportData: options.deleteImportData }
    : value);
}

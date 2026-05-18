const apiBase = '/api/persistent-data';
let dataPathLogged = false;

function request(method: string, name: string, body?: unknown): string | null {
  const xhr = new XMLHttpRequest();
  xhr.open(method, `${apiBase}/${name}`, false);
  xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
  xhr.send(body === undefined ? undefined : JSON.stringify(body));

  return xhr.status >= 200 && xhr.status < 300 ? xhr.responseText : null;
}

export function logPersistentDataPath() {
  if (dataPathLogged || typeof window === 'undefined') {
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

export function writePersistentJson(name: string, value: unknown) {
  if (typeof window === 'undefined') {
    return;
  }

  logPersistentDataPath();
  request('PUT', name, value);
}

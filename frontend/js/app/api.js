export function resolveApiBaseUrl() {
  const { hostname, origin, protocol, port } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "";
  const isBackendOrigin = isLocalHost && port === "3000";

  if (protocol === "file:" || (isLocalHost && !isBackendOrigin)) {
    return "http://localhost:3000";
  }

  return origin;
}

export const API_BASE_URL = resolveApiBaseUrl();

export function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

export async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `请求失败：${response.status}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

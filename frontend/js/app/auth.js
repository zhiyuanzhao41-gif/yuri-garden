import { fetchJson } from "./api.js";

let currentUser;
let hasLoadedUser = false;

export function loginRedirectUrl(characterId) {
  const params = new URLSearchParams();
  params.set("auth", "login");
  if (characterId) params.set("character", characterId);
  return `./index.html?${params.toString()}`;
}

export async function getCurrentUser({ force = false } = {}) {
  if (!force && hasLoadedUser) return currentUser;

  const data = await fetchJson("/api/auth/me");
  currentUser = data.user || null;
  hasLoadedUser = true;
  return currentUser;
}

export async function isAuthenticated() {
  return Boolean(await getCurrentUser());
}

export async function login(username, password) {
  const data = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
  currentUser = data.user || null;
  hasLoadedUser = true;
  return currentUser;
}

export async function register(username, password) {
  const data = await fetchJson("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
  currentUser = data.user || null;
  hasLoadedUser = true;
  return currentUser;
}

export async function logout() {
  await fetchJson("/api/auth/logout", {
    method: "POST",
  });
  currentUser = null;
  hasLoadedUser = true;
}

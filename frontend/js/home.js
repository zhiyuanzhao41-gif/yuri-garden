import { API_BASE_URL, assetUrl } from "./app/api.js";
import { getCurrentUser, login, register } from "./app/auth.js";
import { escapeHtml } from "./app/html.js";

const gardenButton = document.querySelector("[data-scroll-target]");
const characterGrid = document.getElementById("characterGrid");
let authUser = null;
let pendingAction = null;
let authMode = "login";
let authDialog;

function targetFromVisitButton() {
  const targetSelector = gardenButton?.dataset.scrollTarget;
  return targetSelector ? document.querySelector(targetSelector) : null;
}

function scrollToRoles() {
  const target = targetFromVisitButton();
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function openCharacterChat(card) {
  const characterId = card?.dataset.characterId;
  const targetUrl = characterId
    ? `./chat.html?character=${encodeURIComponent(characterId)}`
    : null;

  if (!targetUrl) return;
  window.location.href = targetUrl;
}

function createAuthDialog() {
  const dialog = document.createElement("div");
  dialog.className = "auth-modal";
  dialog.innerHTML = `
    <div class="auth-modal-backdrop" data-auth-close></div>
    <section class="auth-panel" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <div class="auth-panel-media" aria-hidden="true">
        <img src="./assets/login.jpg" alt="">
        <div class="auth-panel-media-glow"></div>
      </div>
      <div class="auth-panel-form">
        <button class="auth-close" type="button" data-auth-close aria-label="关闭登录弹窗">×</button>
        <p class="auth-kicker">Lilian's Garden</p>
        <h2 id="authTitle">欢迎光临莉莉安</h2>
        <p class="auth-subtitle">请登录您的账户以继续</p>
        <form class="auth-form" id="authForm">
          <label class="auth-field">
            <span>用户名</span>
            <input name="username" type="text" autocomplete="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_-]{3,32}">
          </label>
          <label class="auth-field">
            <span>密码</span>
            <input name="password" type="password" autocomplete="current-password" required minlength="6">
          </label>
          <p class="auth-error" id="authError" role="alert"></p>
          <button class="auth-submit" type="submit">登录</button>
          <p class="auth-switch">
            <span class="auth-switch-text" id="authSwitchText">还没有账号？</span>
            <button class="auth-switch-button" type="button" data-auth-mode="register">点击注册</button>
          </p>
        </form>
      </div>
    </section>
  `;
  document.body.append(dialog);
  return dialog;
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  authDialog.querySelector("#authTitle").textContent =
    authMode === "register" ? "Register" : "欢迎光临莉莉安";
  authDialog.querySelector(".auth-subtitle").textContent =
    authMode === "register"
      ? "注册一个新账号"
      : "请登录您的账户以继续";
  authDialog.querySelector(".auth-submit").textContent = authMode === "register" ? "注册" : "登录";
  authDialog.querySelector("#authSwitchText").textContent =
    authMode === "register" ? "已经有账号？" : "还没有账号？";
  authDialog.querySelector(".auth-switch-button").textContent =
    authMode === "register" ? "点击登录" : "点击注册";
  authDialog.querySelector(".auth-switch-button").dataset.authMode =
    authMode === "register" ? "login" : "register";
  authDialog.querySelector("[name='password']").autocomplete =
    authMode === "register" ? "new-password" : "current-password";
  authDialog.querySelector("#authError").textContent = "";
}

function closeAuthDialog() {
  authDialog?.classList.remove("is-open");
}

function openAuthDialog(nextAction, mode = "login") {
  pendingAction = nextAction;
  if (!authDialog) {
    authDialog = createAuthDialog();
    bindAuthDialog();
  }

  setAuthMode(mode);
  authDialog.classList.add("is-open");
  window.setTimeout(() => authDialog.querySelector("[name='username']")?.focus(), 0);
}

function runPendingAction() {
  const action = pendingAction;
  pendingAction = null;
  closeAuthDialog();

  if (typeof action === "function") action();
}

function bindAuthDialog() {
  authDialog.addEventListener("click", (event) => {
    const modeButton = event.target.closest("[data-auth-mode]");
    if (modeButton) {
      setAuthMode(modeButton.dataset.authMode);
      return;
    }

    if (event.target.closest("[data-auth-close]")) {
      closeAuthDialog();
    }
  });

  authDialog.addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.target;
    const error = authDialog.querySelector("#authError");
    const submitButton = authDialog.querySelector(".auth-submit");
    const formData = new FormData(form);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");

    error.textContent = "";
    submitButton.disabled = true;

    try {
      authUser = authMode === "register"
        ? await register(username, password)
        : await login(username, password);
      form.reset();
      runPendingAction();
    } catch (requestError) {
      error.textContent = requestError.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function requireAuthFor(action) {
  if (authUser) {
    action();
    return;
  }

  authUser = await getCurrentUser();
  if (authUser) {
    action();
    return;
  }

  openAuthDialog(action);
}

function characterCardTemplate(character) {
  const coverUrl = assetUrl(character.assets?.cover);
  const image = coverUrl
    ? `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(character.name)}">`
    : `<span>${escapeHtml(character.initials || character.name)}</span>`;
  const placeholderClass = coverUrl ? "" : " is-placeholder";

  return `
    <article
      class="character-card character-card-link${placeholderClass}"
      data-character-id="${escapeHtml(character.id)}"
      data-initials="${escapeHtml(character.initials || character.name)}"
      role="link"
      tabindex="0"
      aria-label="与${escapeHtml(character.name)}聊天"
    >
      <div class="character-image">
        ${image}
      </div>
      <div class="character-name">${escapeHtml(character.name)}</div>
    </article>
  `;
}

function showCharacterImageFallback(image) {
  const card = image.closest(".character-card");
  const fallback = document.createElement("span");
  fallback.textContent = card?.dataset.initials || "";
  card?.classList.add("is-placeholder");
  image.replaceWith(fallback);
}

function bindCharacterCards() {
  document.querySelectorAll(".character-card-link").forEach((card) => {
    card.addEventListener("click", () => {
      requireAuthFor(() => openCharacterChat(card));
    });

    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      requireAuthFor(() => openCharacterChat(card));
    });

    card.querySelector("img")?.addEventListener("error", (event) => {
      showCharacterImageFallback(event.currentTarget);
    });
  });
}

async function loadCharacters() {
  if (!characterGrid) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/characters`, { credentials: "include" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `请求失败：${response.status}`);
    }

    const characters = data.characters || [];
    if (!characters.length) {
      characterGrid.innerHTML = `
        <article class="character-card is-placeholder">
          <div class="character-image" aria-hidden="true"><span>Empty</span></div>
          <div class="character-name">暂无角色</div>
        </article>
      `;
      return;
    }

    characterGrid.innerHTML = characters.map(characterCardTemplate).join("");
    bindCharacterCards();
  } catch (error) {
    characterGrid.innerHTML = `
      <article class="character-card is-placeholder">
        <div class="character-image" aria-hidden="true"><span>Error</span></div>
        <div class="character-name">${escapeHtml(error.message)}</div>
      </article>
    `;
  }
}

if (gardenButton) {
  gardenButton.addEventListener("click", () => {
    requireAuthFor(scrollToRoles);
  });
}

async function bootHome() {
  try {
    authUser = await getCurrentUser();
  } catch {
    authUser = null;
  }

  await loadCharacters();

  const params = new URLSearchParams(window.location.search);
  if (params.get("auth") === "login" && !authUser) {
    const characterId = params.get("character");
    openAuthDialog(
      characterId
        ? () => {
            window.location.href = `./chat.html?character=${encodeURIComponent(characterId)}`;
          }
        : scrollToRoles,
    );
  }
}

bootHome();

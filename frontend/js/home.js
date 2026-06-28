const gardenButton = document.querySelector("[data-scroll-target]");
const characterGrid = document.getElementById("characterGrid");

function resolveApiBaseUrl() {
  const { hostname, origin, protocol, port } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "";
  const isBackendOrigin = isLocalHost && port === "3000";

  if (protocol === "file:" || (isLocalHost && !isBackendOrigin)) {
    return "http://localhost:3000";
  }

  return origin;
}

const API_BASE_URL = resolveApiBaseUrl();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

function openCharacterChat(card) {
  const characterId = card?.dataset.characterId;
  const targetUrl = characterId
    ? `./chat.html?character=${encodeURIComponent(characterId)}`
    : null;

  if (!targetUrl) return;
  window.location.href = targetUrl;
}

function characterCardTemplate(character) {
  const coverUrl = assetUrl(character.assets?.cover);
  const image = coverUrl
    ? `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(character.name)}" onerror="showCharacterImageFallback(this);">`
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
      openCharacterChat(card);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openCharacterChat(card);
    });
  });
}

async function loadCharacters() {
  if (!characterGrid) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/characters`);
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
    const targetSelector = gardenButton.dataset.scrollTarget;
    const target = targetSelector ? document.querySelector(targetSelector) : null;

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

loadCharacters();

const gardenButton = document.querySelector("[data-scroll-target]");

if (gardenButton) {
  gardenButton.addEventListener("click", () => {
    const targetSelector = gardenButton.dataset.scrollTarget;
    const target = targetSelector ? document.querySelector(targetSelector) : null;

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

document.querySelectorAll(".character-card").forEach((card) => {
  card.addEventListener("click", () => {
    // TODO: Wire character cards to chat routing when role selection is ready.
  });
});

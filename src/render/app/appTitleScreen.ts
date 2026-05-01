export function createTitleScreen(onStart: () => void) {
  const titleScreen = document.createElement("div");
  titleScreen.className = "title-screen";
  titleScreen.setAttribute("role", "dialog");
  titleScreen.setAttribute("aria-label", "Mossu title screen");
  titleScreen.innerHTML = `
    <div class="title-screen__sky" aria-hidden="true"></div>
    <div class="title-screen__shade" aria-hidden="true"></div>
    <div class="title-screen__bloom" aria-hidden="true"></div>
    <div class="title-screen__bokeh" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
    <div class="title-screen__menu">
      <span class="title-screen__glint title-screen__glint--one"></span>
      <span class="title-screen__glint title-screen__glint--two"></span>
      <div class="title-screen__crest" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <h1 class="title-screen__logo">Mossu</h1>
      <div class="title-screen__actions">
        <button class="title-screen__button title-screen__button--play" type="button" aria-label="Begin Mossu">
          <span class="title-screen__button-icon" aria-hidden="true"></span>
          <span class="title-screen__button-label">Play</span>
        </button>
        <button class="title-screen__button title-screen__button--settings" type="button" aria-label="Open settings">
          <span class="title-screen__button-icon" aria-hidden="true"></span>
          <span class="title-screen__button-label">Settings</span>
        </button>
      </div>
      <section class="title-screen__settings" aria-label="Settings">
        <div class="title-screen__settings-header">
          <p>Settings</p>
          <button class="title-screen__settings-back" type="button" aria-label="Return to main menu">Back</button>
        </div>
        <div class="title-screen__settings-grid">
          <div class="title-screen__setting-row">
            <span><em>Camera</em><small>Cinematic shoulder drift</small></span>
            <strong>Cinematic</strong>
          </div>
          <div class="title-screen__setting-row">
            <span><em>HUD</em><small>Softens during scenic beats</small></span>
            <strong>Soft</strong>
          </div>
          <div class="title-screen__setting-row">
            <span><em>Performance</em><small>Adaptive render guard</small></span>
            <strong>60fps</strong>
          </div>
          <div class="title-screen__setting-row">
            <span><em>Audio</em><small>Ambient meadow mix</small></span>
            <strong>Ambient</strong>
          </div>
        </div>
      </section>
    </div>
  `;
  titleScreen
    .querySelectorAll<HTMLButtonElement>(".title-screen__button--play")
    .forEach((button) => {
      button.addEventListener("click", onStart);
    });
  titleScreen
    .querySelector<HTMLButtonElement>(".title-screen__button--settings")
    ?.addEventListener("click", () => {
      titleScreen.classList.add("title-screen--settings-open");
      titleScreen.querySelector<HTMLButtonElement>(".title-screen__settings-back")?.focus();
    });
  titleScreen
    .querySelector<HTMLButtonElement>(".title-screen__settings-back")
    ?.addEventListener("click", () => {
      titleScreen.classList.remove("title-screen--settings-open");
      titleScreen.querySelector<HTMLButtonElement>(".title-screen__button--settings")?.focus();
    });
  return titleScreen;
}

export function createOpeningSequenceOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "opening-sequence";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="opening-sequence__panel">
      <p class="opening-sequence__kicker">Habitat wake</p>
      <strong>Burrow Hollow shimmers awake</strong>
      <span>water light, route grass, and a first Karu stir near the lake path</span>
      <div class="opening-sequence__beats" aria-hidden="true">
        <i>meadow</i>
        <i>water</i>
        <i>Karu</i>
      </div>
    </div>
    <p class="opening-sequence__skip">Move to take over</p>
  `;
  return overlay;
}

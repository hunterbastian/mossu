import type { CharacterScreenView } from "../../simulation/characterScreenData";

type CollectionEntry = CharacterScreenView["collections"][number];
type GatheredGoodEntry = CharacterScreenView["gatheredGoods"][number];

export interface InventoryCardHandlers {
  pointerMove: (event: PointerEvent) => void;
  pointerLeave: (event: PointerEvent) => void;
  focus: (event: FocusEvent) => void;
  blur: (event: FocusEvent) => void;
}

export interface CollectionCardOptions {
  entries: CollectionEntry[];
  highlightedCollectionId: string | null;
  handlers: InventoryCardHandlers;
  prettyZone: (zone: string) => string;
  binderZoneCode: (zone: string) => string;
  cardSeriesLabel: (index: number, total: number) => string;
}

export interface GatheredGoodCardOptions {
  entries: GatheredGoodEntry[];
  handlers: InventoryCardHandlers;
  prettyZone: (zone: string) => string;
  formatForageableKind: (kind: string) => string;
  cardSeriesLabel: (index: number, total: number) => string;
}

export function buildStatusMetric(
  label: string,
  value: HTMLElement,
  kind: "area" | "landmark" | "breeze" | "cards" | "objective",
) {
  const wrapper = document.createElement("div");
  wrapper.className = `status-metric status-metric--${kind}`;
  const icon = document.createElement("span");
  icon.className = "status-metric__icon";
  icon.setAttribute("aria-hidden", "true");
  const body = document.createElement("div");
  body.className = "status-metric__body";
  const labelNode = document.createElement("p");
  labelNode.className = "status-label";
  labelNode.textContent = label;
  value.className = "status-value";
  body.append(labelNode, value);
  wrapper.append(icon, body);
  return wrapper;
}

export function buildPauseAction(command: string, keyText: string, titleText: string, bodyText: string) {
  const article = document.createElement("button");
  article.type = "button";
  article.className = `pause-action pause-action--${command}`;
  article.dataset.uiCommand = command;

  const key = document.createElement("kbd");
  key.className = "pause-action__key";
  key.textContent = keyText;

  const title = document.createElement("h3");
  title.className = "pause-action__title";
  title.textContent = titleText;

  const body = document.createElement("p");
  body.className = "pause-action__body";
  body.textContent = bodyText;

  article.append(key, title, body);
  return article;
}

export function buildPauseStat(labelText: string, valueNode: HTMLElement) {
  const article = document.createElement("article");
  article.className = "pause-stat";

  const label = document.createElement("p");
  label.className = "pause-stat__label";
  label.textContent = labelText;

  valueNode.className = "pause-stat__value";
  article.append(label, valueNode);
  return article;
}

export function buildMapLegendRow(swatchClassName: string, labelText: string) {
  const row = document.createElement("div");
  row.className = "world-map__legend-row";
  const swatch = document.createElement("span");
  swatch.className = swatchClassName;
  swatch.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "world-map__legend-label";
  label.textContent = labelText;
  row.append(swatch, label);
  return row;
}

export function buildMapFilter(className: string, symbolText: string, labelText: string) {
  const item = document.createElement("div");
  item.className = `world-map__filter ${className}`;
  const icon = document.createElement("span");
  icon.className = "world-map__filter-icon";
  icon.textContent = symbolText;
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "world-map__filter-label";
  label.textContent = labelText;
  item.append(icon, label);
  return item;
}

export function buildMapInfoCard(eyebrowText: string, title: HTMLElement, body: HTMLElement) {
  const card = document.createElement("section");
  card.className = "world-map__card";

  const eyebrow = document.createElement("p");
  eyebrow.className = "world-map__card-eyebrow";
  eyebrow.textContent = eyebrowText;

  card.append(eyebrow, title, body);
  return card;
}

export function buildCharacterSection(titleText: string, eyebrowText: string, badgeNode?: HTMLElement) {
  const section = document.createElement("section");
  section.className = "character-section";

  const eyebrow = document.createElement("p");
  eyebrow.className = "character-section__eyebrow";
  eyebrow.textContent = eyebrowText;

  const heading = document.createElement("div");
  heading.className = "character-section__heading";

  const title = document.createElement("h3");
  title.className = "character-section__title";
  title.textContent = titleText;

  if (badgeNode) {
    badgeNode.className = "character-section__badge";
    heading.append(title, badgeNode);
  } else {
    heading.append(title);
  }

  section.append(eyebrow, heading);
  return section;
}

export function buildCharacterProgressRow(
  labelText: string,
  kind: "keepsake" | "goods",
  valueNode: HTMLElement,
  fillNode: HTMLElement,
) {
  const row = document.createElement("div");
  row.className = `character-screen__progress-row character-screen__progress-row--${kind}`;

  const header = document.createElement("div");
  header.className = "character-screen__progress-header";
  const label = document.createElement("span");
  label.textContent = labelText;
  valueNode.textContent = "0/0";
  header.append(label, valueNode);

  const track = document.createElement("span");
  track.className = "character-screen__progress-track";
  fillNode.className = "character-screen__progress-fill";
  track.append(fillNode);

  row.append(header, track);
  return row;
}

export function buildCollectionCards(options: CollectionCardOptions): HTMLElement[] {
  return options.entries.map((entry, index) => {
    const article = createInventoryArticle(
      [
        "collection-entry",
        "inventory-holo-card",
        "inventory-holo-card--keepsake",
        `inventory-holo-card--tone-${index % 5}`,
        entry.discovered ? "inventory-holo-card--owned" : "inventory-holo-card--missing",
        entry.discovered ? "collection-entry--discovered" : "collection-entry--locked",
        entry.landmarkId === options.highlightedCollectionId ? "collection-entry--highlighted" : "",
      ],
      entry.discovered
        ? `${entry.keepsakeTitle}, ${entry.landmarkTitle}, logged keepsake card`
        : `${entry.landmarkTitle}, hidden keepsake card`,
      options.handlers,
    );
    const { content, appendChrome } = createInventoryChrome();

    const header = buildCardHeader(index, entry.discovered ? "Sleeved" : "Blank");
    const art = document.createElement("div");
    art.className = "inventory-holo-card__art inventory-holo-card__art--keepsake";
    const artLabel = document.createElement("span");
    artLabel.className = "inventory-holo-card__symbol";
    artLabel.textContent = entry.discovered ? options.binderZoneCode(entry.zone) : "???";
    art.append(artLabel);

    const zone = document.createElement("p");
    zone.className = "collection-entry__zone";
    zone.textContent = options.prettyZone(entry.zone);

    const rarity = document.createElement("p");
    rarity.className = "inventory-holo-card__rarity";
    rarity.textContent = entry.discovered ? options.cardSeriesLabel(index, options.entries.length) : "unfound";

    const title = document.createElement("h3");
    title.className = "collection-entry__title";
    title.textContent = entry.discovered ? entry.keepsakeTitle : "Unfound keepsake";

    const landmark = document.createElement("p");
    landmark.className = "collection-entry__landmark";
    landmark.textContent = entry.landmarkTitle;

    const meta = document.createElement("div");
    meta.className = "inventory-holo-card__meta";
    meta.append(zone, rarity, landmark);

    const body = document.createElement("p");
    body.className = "collection-entry__body";
    body.textContent = entry.discovered
      ? entry.keepsakeSummary
      : `A blank sleeve points toward ${entry.landmarkTitle}. Reach the spot to stamp this page.`;

    const stamp = document.createElement("p");
    stamp.className = "inventory-holo-card__binder-stamp";
    stamp.textContent = entry.discovered ? "Filed in Mossu's route set" : "Not stamped yet";

    content.append(header, art, title, meta, body, stamp);
    appendChrome(article);
    return article;
  });
}

export function buildGatheredGoodCards(options: GatheredGoodCardOptions): HTMLElement[] {
  return options.entries.map((entry, index) => {
    const article = createInventoryArticle(
      [
        "gathered-good",
        "inventory-holo-card",
        "inventory-holo-card--good",
        `inventory-holo-card--tone-${(index + 2) % 5}`,
        entry.gathered ? "inventory-holo-card--owned" : "inventory-holo-card--missing",
        entry.gathered ? "gathered-good--collected" : "gathered-good--locked",
        `gathered-good--${entry.kind}`,
      ],
      entry.gathered
        ? `${entry.title}, ${options.formatForageableKind(entry.kind)}, gathered pouch good`
        : `${options.prettyZone(entry.zone)}, unknown pouch good`,
      options.handlers,
    );
    const { content, appendChrome } = createInventoryChrome();

    const header = buildCardHeader(index, entry.gathered ? "Sleeved" : "Trace");
    const art = document.createElement("div");
    art.className = `inventory-holo-card__art inventory-holo-card__art--good inventory-holo-card__art--${entry.kind}`;
    const artLabel = document.createElement("span");
    artLabel.className = "inventory-holo-card__symbol";
    artLabel.textContent = entry.gathered ? options.formatForageableKind(entry.kind) : "???";
    art.append(artLabel);

    const zone = document.createElement("p");
    zone.className = "gathered-good__zone";
    zone.textContent = options.prettyZone(entry.zone);

    const title = document.createElement("h3");
    title.className = "gathered-good__title";
    title.textContent = entry.gathered ? entry.title : "Unknown wild good";

    const kind = document.createElement("p");
    kind.className = "gathered-good__kind";
    kind.textContent = entry.gathered ? options.formatForageableKind(entry.kind) : "Uncollected";

    const rarity = document.createElement("p");
    rarity.className = "inventory-holo-card__rarity";
    rarity.textContent = entry.gathered ? options.cardSeriesLabel(index, options.entries.length) : "trace";

    const meta = document.createElement("div");
    meta.className = "inventory-holo-card__meta";
    meta.append(zone, rarity, kind);

    const body = document.createElement("p");
    body.className = "gathered-good__body";
    body.textContent = entry.gathered
      ? entry.summary
      : "A faint outline waits on this sleeve. Gather the trail good to reveal its full field card.";

    const stamp = document.createElement("p");
    stamp.className = "inventory-holo-card__binder-stamp";
    stamp.textContent = entry.gathered ? "Filed in Mossu's pouch set" : "Not gathered yet";

    content.append(header, art, title, meta, body, stamp);
    appendChrome(article);
    return article;
  });
}

export function renderQuickActions(actions: Array<[string, string]>) {
  return `<span class="quick-actions">${actions.map(([key, label]) => `<span class="quick-actions__item"><kbd>${key}</kbd><span>${label}</span></span>`).join("")}</span>`;
}

function createInventoryArticle(classNames: string[], ariaLabel: string, handlers: InventoryCardHandlers) {
  const article = document.createElement("article");
  article.className = classNames.filter((className) => className.length > 0).join(" ");
  article.tabIndex = 0;
  article.setAttribute("aria-label", ariaLabel);
  article.addEventListener("pointermove", handlers.pointerMove);
  article.addEventListener("pointerleave", handlers.pointerLeave);
  article.addEventListener("focus", handlers.focus);
  article.addEventListener("blur", handlers.blur);
  return article;
}

function createInventoryChrome() {
  const foil = document.createElement("div");
  foil.className = "inventory-holo-card__foil";
  foil.setAttribute("aria-hidden", "true");

  const sheen = document.createElement("div");
  sheen.className = "inventory-holo-card__sheen";
  sheen.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  content.className = "inventory-holo-card__content";

  return {
    content,
    appendChrome: (article: HTMLElement) => article.append(foil, sheen, content),
  };
}

function buildCardHeader(index: number, statusText: string) {
  const header = document.createElement("div");
  header.className = "inventory-holo-card__header";

  const number = document.createElement("p");
  number.className = "inventory-holo-card__index";
  number.textContent = `No. ${String(index + 1).padStart(2, "0")}`;

  const status = document.createElement("p");
  status.className = "inventory-holo-card__status";
  status.textContent = statusText;

  header.append(number, status);
  return header;
}

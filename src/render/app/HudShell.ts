import { MathUtils } from "three";
import type { CharacterScreenView } from "../../simulation/characterScreenData";
import type { FrameState } from "../../simulation/gameState";
import { WorldLandmark, worldLandmarks } from "../../simulation/world";
import { ViewMode } from "../../simulation/viewMode";
import {
  createSvgElement,
  getMapLabelLayout,
  mapBoundaryPath,
  MapMarkerElements,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_WIDTH,
  mapRiverBranchPaths,
  mapRiverPath,
  mapRoutePath,
  projectWorldToMap,
  routeLandmarks,
} from "./worldMap";

export interface HudShellUpdate {
  frame: FrameState;
  characterData: CharacterScreenView;
  viewMode: ViewMode;
  pauseMenuOpen: boolean;
  characterScreenOpen: boolean;
  pointerLocked: boolean;
  focusedCollectionId: string | null;
  fauna: {
    speciesName: string;
    recruitedCount: number;
    nearestRecruitableDistance: number | null;
    recruitedThisFrame: number;
  };
  windStrength: number;
}

export class HudShell {
  readonly element: HTMLDivElement;

  private readonly mapOverlay = document.createElement("section");
  private readonly mapSvg = createSvgElement("svg");
  private readonly mapCurrentTitle = document.createElement("h2");
  private readonly mapCurrentBody = document.createElement("p");
  private readonly mapNextStop = document.createElement("p");
  private readonly mapCollectionsSummary = document.createElement("p");
  private readonly mapStamp = document.createElement("div");
  private readonly mapPlayerMarker = this.createMapPlayerMarker();
  private readonly mapLandmarkMarkers = new Map<string, MapMarkerElements>();
  private readonly mapRouteSteps = new Map<string, HTMLLIElement>();
  private readonly controlsPanel = document.createElement("section");
  private readonly controlsPanelStatus = document.createElement("p");
  private readonly staminaHud = document.createElement("section");
  private readonly staminaRing = document.createElement("div");
  private readonly staminaValue = document.createElement("p");
  private readonly pauseMenu = document.createElement("aside");
  private readonly pauseSummary = document.createElement("p");
  private readonly pauseStatusValues = {
    area: document.createElement("p"),
    landmark: document.createElement("p"),
    breeze: document.createElement("p"),
    collections: document.createElement("p"),
    goods: document.createElement("p"),
  };
  private readonly characterScreen = document.createElement("aside");
  private readonly characterSummary = document.createElement("p");
  private readonly characterNearby = document.createElement("p");
  private readonly characterStamp = document.createElement("div");
  private readonly statsGrid = document.createElement("div");
  private readonly upgradesGrid = document.createElement("div");
  private readonly collectionsList = document.createElement("div");
  private readonly gatheredGoodsList = document.createElement("div");
  private readonly collectionsSectionBadge = document.createElement("span");
  private readonly gatheredGoodsSectionBadge = document.createElement("span");
  private characterScreenSignature = "";
  private readonly statusValues = {
    zone: document.createElement("p"),
    landmark: document.createElement("p"),
    wind: document.createElement("p"),
    collections: document.createElement("p"),
    ability: document.createElement("div"),
    objectiveTitle: document.createElement("h1"),
    objectiveBody: document.createElement("p"),
    prompt: document.createElement("div"),
    hint: document.createElement("div"),
  };

  constructor(previewElement: HTMLElement) {
    this.element = this.buildHud(previewElement);
  }

  update({
    frame,
    characterData,
    viewMode,
    pauseMenuOpen,
    characterScreenOpen,
    pointerLocked,
    focusedCollectionId,
    fauna,
    windStrength,
  }: HudShellUpdate) {
    const isMapMode = viewMode === "map_lookdown";
    const latestCollection = characterData.collections.find(
      (entry) => entry.landmarkId === characterData.latestCollectionId,
    );
    const nearbyCollection = characterData.collections.find(
      (entry) => entry.landmarkId === characterData.nearbyCollectionId,
    );
    const latestGatheredGood = characterData.gatheredGoods.find(
      (entry) => entry.forageableId === characterData.latestGatheredGoodId,
    );
    const faunaName = fauna.speciesName;
    const nearbyRecruitableFauna =
      fauna.nearestRecruitableDistance !== null &&
      fauna.nearestRecruitableDistance <= 14.5;
    const shouldShowControlsPanel = pauseMenuOpen || characterScreenOpen || isMapMode || !pointerLocked;

    this.statusValues.zone.textContent = this.prettyZone(frame.currentZone);
    this.statusValues.landmark.textContent = frame.currentLandmark;
    this.statusValues.wind.textContent = `${Math.round(windStrength * 100)}%`;
    this.statusValues.collections.textContent = `${characterData.totals.discovered}/${characterData.totals.total}`;
    this.updateStaminaHud(frame.player.stamina, frame.player.staminaMax, frame.player.staminaVisible);
    this.element.classList.toggle("hud--map", isMapMode);
    this.element.classList.toggle("hud--pause", pauseMenuOpen);
    this.element.classList.toggle("hud--character-screen", characterScreenOpen);
    this.pauseMenu.classList.toggle("pause-menu--open", pauseMenuOpen);
    this.characterScreen.classList.toggle("character-screen--open", characterScreenOpen);
    this.controlsPanel.classList.toggle("controls-panel--visible", shouldShowControlsPanel);
    this.updateMapOverlay(frame, characterData, viewMode);
    this.updatePauseMenu(frame, characterData, windStrength);
    this.updateCharacterScreen(characterData, focusedCollectionId, characterScreenOpen);

    if (pauseMenuOpen) {
      this.statusValues.objectiveTitle.textContent = "Pause Menu";
      this.statusValues.objectiveBody.textContent = "Movement is paused. Pick a surface and jump back in when you're ready.";
      this.statusValues.ability.textContent = "Paused.";
      this.statusValues.prompt.innerHTML = "<strong>Trail Break</strong> Resume, check the inventory, or swing out to the map.";
      this.controlsPanelStatus.innerHTML = "Everything is paused while the menu is open.";
      this.statusValues.hint.innerHTML = this.renderQuickActions([
        ["Esc", "resume"],
        ["Tab", "inventory"],
        ["M", "map"],
      ]);
      return;
    }

    if (isMapMode) {
      this.statusValues.objectiveTitle.textContent = "Region Map";
      this.statusValues.objectiveBody.textContent = "Blue marks Mossu, gold marks the shrine, and the route log tracks the climb north.";
      this.statusValues.ability.textContent = "Inventory ready: Tab opens Mossu's stats, abilities, and field entries.";
      this.statusValues.prompt.innerHTML = "<strong>Region Map</strong> Check the route, then jump back to the trail when you're ready.";
      this.controlsPanelStatus.innerHTML = "Movement pauses while the map is open. Press <strong>M</strong> or <strong>Esc</strong> to return to the trail.";
      this.statusValues.hint.innerHTML = this.renderQuickActions([
        ["Tab", "inventory"],
        ["M", "close"],
        ["Esc", "close"],
      ]);
      return;
    }

    this.statusValues.objectiveTitle.textContent = frame.objective.title;
    this.statusValues.objectiveBody.textContent = frame.objective.body;
    this.statusValues.ability.textContent = "Ability ready: Breeze Float lets Mossu drift across ravines by holding Space in the air.";

    if (characterScreenOpen) {
      this.statusValues.prompt.innerHTML = "<strong>Inventory</strong> Tab or Esc closes Mossu's holo binder.";
    } else if (latestGatheredGood) {
      this.statusValues.prompt.innerHTML = `<strong>Foraged</strong> ${latestGatheredGood.title} was tucked into Mossu's gather pouch.`;
    } else if (latestCollection) {
      this.statusValues.prompt.innerHTML = `<strong>New Entry</strong> ${latestCollection.keepsakeTitle} was registered in Mossu's field log.`;
    } else if (fauna.recruitedThisFrame > 0) {
      this.statusValues.prompt.innerHTML = `<strong>${faunaName}</strong> ${fauna.recruitedThisFrame} ${faunaName} joined Mossu's trail.`;
    } else if (nearbyRecruitableFauna) {
      this.statusValues.prompt.innerHTML = `<strong>${faunaName}</strong> Press E to have them follow Mossu.`;
    } else if (fauna.recruitedCount > 0) {
      this.statusValues.prompt.innerHTML = `<strong>${faunaName}</strong> ${fauna.recruitedCount} ${faunaName} following Mossu.`;
    } else if (nearbyCollection) {
      this.statusValues.prompt.innerHTML = `<strong>Nearby Landmark</strong> ${nearbyCollection.landmarkTitle} will register automatically when Mossu reaches it.`;
    } else {
      this.statusValues.prompt.innerHTML = "<strong>Inventory</strong> Press Tab to open Mossu's holo binder. Press E to interact when something is nearby.";
    }

    if (characterScreenOpen) {
      this.controlsPanelStatus.innerHTML = "Movement pauses while the inventory is open. Press <strong>Tab</strong> or <strong>Esc</strong> to get back outside.";
    } else if (pointerLocked) {
      this.controlsPanelStatus.innerHTML = "Mouse look is active. W/A/S/D moves relative to the camera, the wheel zooms, and <strong>Esc</strong> pauses.";
    } else {
      this.controlsPanelStatus.innerHTML = "Click the world to look around. W/A/S/D moves relative to the camera view.";
    }

    this.statusValues.hint.innerHTML = this.renderQuickActions([
      ["W/A/S/D", "move"],
      ["Space", "jump / float"],
      ["Shift", "roll"],
      ["E", "interact"],
      ["Tab", "inventory"],
      ["M", "map"],
      ["Esc", "pause"],
    ]);
  }

  private updatePauseMenu(frame: FrameState, characterData: CharacterScreenView, windStrength: number) {
    this.pauseSummary.textContent = `Mossu is resting in ${this.prettyZone(frame.currentZone)} with ${characterData.totals.discovered} field notes logged and ${characterData.gatheredTotals.gathered} wild goods gathered.`;
    this.pauseStatusValues.area.textContent = this.prettyZone(frame.currentZone);
    this.pauseStatusValues.landmark.textContent = frame.currentLandmark;
    this.pauseStatusValues.breeze.textContent = `${Math.round(windStrength * 100)}% drift`;
    this.pauseStatusValues.collections.textContent = `${characterData.totals.discovered}/${characterData.totals.total} logged`;
    this.pauseStatusValues.goods.textContent = `${characterData.gatheredTotals.gathered}/${characterData.gatheredTotals.total} gathered`;
  }

  private updateCharacterScreen(characterData: CharacterScreenView, focusedCollectionId: string | null, isOpen: boolean) {
    if (!isOpen) {
      this.characterScreenSignature = "";
      return;
    }

    const highlightedCollectionId =
      characterData.latestCollectionId ?? characterData.nearbyCollectionId ?? focusedCollectionId;
    const signature = [
      characterData.latestCollectionId ?? "",
      characterData.latestGatheredGoodId ?? "",
      characterData.nearbyCollectionId ?? "",
      highlightedCollectionId ?? "",
      characterData.totals.discovered,
      characterData.gatheredTotals.gathered,
      ...characterData.stats.map((stat) => stat.value),
    ].join("|");
    if (signature === this.characterScreenSignature) {
      return;
    }
    this.characterScreenSignature = signature;

    const latestGatheredGood = characterData.gatheredGoods.find(
      (entry) => entry.forageableId === characterData.latestGatheredGoodId,
    );

    this.characterSummary.textContent = `Mossu's holo-card binder is still growing. ${characterData.totals.discovered} of ${characterData.totals.total} landmark cards have been registered, and ${characterData.gatheredTotals.gathered} of ${characterData.gatheredTotals.total} wild goods have been gathered so far.`;
    this.characterStamp.textContent = `${characterData.totals.discovered}/${characterData.totals.total} cards · ${characterData.gatheredTotals.gathered}/${characterData.gatheredTotals.total} goods`;
    this.collectionsSectionBadge.textContent = `${characterData.totals.discovered}/${characterData.totals.total}`;
    this.gatheredGoodsSectionBadge.textContent = `${characterData.gatheredTotals.gathered}/${characterData.gatheredTotals.total}`;

    const latestCollection = characterData.collections.find(
      (entry) => entry.landmarkId === characterData.latestCollectionId,
    );
    const nearbyCollection = characterData.collections.find(
      (entry) => entry.landmarkId === characterData.nearbyCollectionId,
    );

    this.characterNearby.textContent = latestGatheredGood
      ? `Latest forage: ${latestGatheredGood.title}. Mossu tucked it away with the trail supplies.`
      : latestCollection
        ? `Latest entry: ${latestCollection.keepsakeTitle} from ${latestCollection.landmarkTitle}.`
        : nearbyCollection
          ? `Nearest landmark: ${nearbyCollection.landmarkTitle}. It will register automatically once Mossu gets there.`
          : "No new landmark is in range right now. Keep exploring to fill the field log.";

    this.statsGrid.replaceChildren(
      ...characterData.stats.map((stat) => {
        const article = document.createElement("article");
        article.className = "character-stat";

        const label = document.createElement("p");
        label.className = "character-stat__label";
        label.textContent = stat.label;

        const value = document.createElement("h3");
        value.className = "character-stat__value";
        value.textContent = stat.value;

        const detail = document.createElement("p");
        detail.className = "character-stat__detail";
        detail.textContent = stat.detail;

        article.append(label, value, detail);
        return article;
      }),
    );

    this.upgradesGrid.replaceChildren(
      ...[...characterData.upgrades.unlocked, ...characterData.upgrades.locked].map((upgrade) => {
        const article = document.createElement("article");
        article.className = `upgrade-card upgrade-card--${upgrade.status}`;

        const badge = document.createElement("p");
        badge.className = "upgrade-card__badge";
        badge.textContent = upgrade.status === "unlocked" ? "Unlocked" : "Locked";

        const title = document.createElement("h3");
        title.className = "upgrade-card__title";
        title.textContent = upgrade.label;

        const body = document.createElement("p");
        body.className = "upgrade-card__body";
        body.textContent = upgrade.description;

        article.append(badge, title, body);
        return article;
      }),
    );

    this.collectionsList.replaceChildren(
      ...characterData.collections.map((entry, index) => {
        const article = document.createElement("article");
        article.className = [
          "collection-entry",
          "inventory-holo-card",
          "inventory-holo-card--keepsake",
          `inventory-holo-card--tone-${index % 5}`,
          entry.discovered ? "collection-entry--discovered" : "collection-entry--locked",
          entry.landmarkId === highlightedCollectionId ? "collection-entry--highlighted" : "",
        ]
          .filter((className) => className.length > 0)
          .join(" ");

        const foil = document.createElement("div");
        foil.className = "inventory-holo-card__foil";
        foil.setAttribute("aria-hidden", "true");

        const sheen = document.createElement("div");
        sheen.className = "inventory-holo-card__sheen";
        sheen.setAttribute("aria-hidden", "true");

        const content = document.createElement("div");
        content.className = "inventory-holo-card__content";

        const header = document.createElement("div");
        header.className = "inventory-holo-card__header";

        const number = document.createElement("p");
        number.className = "inventory-holo-card__index";
        number.textContent = `No. ${String(index + 1).padStart(2, "0")}`;

        const status = document.createElement("p");
        status.className = "inventory-holo-card__status";
        status.textContent = entry.discovered ? "Logged" : "Hidden";

        header.append(number, status);

        const art = document.createElement("div");
        art.className = "inventory-holo-card__art inventory-holo-card__art--keepsake";
        const artLabel = document.createElement("span");
        artLabel.className = "inventory-holo-card__symbol";
        artLabel.textContent = entry.discovered ? this.binderZoneCode(entry.zone) : "???";
        art.append(artLabel);

        const zone = document.createElement("p");
        zone.className = "collection-entry__zone";
        zone.textContent = this.prettyZone(entry.zone);

        const title = document.createElement("h3");
        title.className = "collection-entry__title";
        title.textContent = entry.discovered ? entry.keepsakeTitle : "Unfound keepsake";

        const landmark = document.createElement("p");
        landmark.className = "collection-entry__landmark";
        landmark.textContent = entry.landmarkTitle;

        const meta = document.createElement("div");
        meta.className = "inventory-holo-card__meta";
        meta.append(zone, landmark);

        const body = document.createElement("p");
        body.className = "collection-entry__body";
        body.textContent = entry.discovered
          ? entry.keepsakeSummary
          : `A keepsake silhouette remains at ${entry.landmarkTitle}, waiting for Mossu to wander close enough to log it.`;

        content.append(header, art, title, meta, body);
        article.append(foil, sheen, content);
        return article;
      }),
    );

    this.gatheredGoodsList.replaceChildren(
      ...characterData.gatheredGoods.map((entry, index) => {
        const article = document.createElement("article");
        article.className = [
          "gathered-good",
          "inventory-holo-card",
          "inventory-holo-card--good",
          `inventory-holo-card--tone-${(index + 2) % 5}`,
          entry.gathered ? "gathered-good--collected" : "gathered-good--locked",
          `gathered-good--${entry.kind}`,
        ].join(" ");

        const foil = document.createElement("div");
        foil.className = "inventory-holo-card__foil";
        foil.setAttribute("aria-hidden", "true");

        const sheen = document.createElement("div");
        sheen.className = "inventory-holo-card__sheen";
        sheen.setAttribute("aria-hidden", "true");

        const content = document.createElement("div");
        content.className = "inventory-holo-card__content";

        const header = document.createElement("div");
        header.className = "inventory-holo-card__header";

        const number = document.createElement("p");
        number.className = "inventory-holo-card__index";
        number.textContent = `No. ${String(index + 1).padStart(2, "0")}`;

        const status = document.createElement("p");
        status.className = "inventory-holo-card__status";
        status.textContent = entry.gathered ? "Gathered" : "Trace";

        header.append(number, status);

        const art = document.createElement("div");
        art.className = `inventory-holo-card__art inventory-holo-card__art--good inventory-holo-card__art--${entry.kind}`;
        const artLabel = document.createElement("span");
        artLabel.className = "inventory-holo-card__symbol";
        artLabel.textContent = entry.gathered ? (entry.kind === "fruit" ? "FRUIT" : "PLANT") : "???";
        art.append(artLabel);

        const zone = document.createElement("p");
        zone.className = "gathered-good__zone";
        zone.textContent = this.prettyZone(entry.zone);

        const title = document.createElement("h3");
        title.className = "gathered-good__title";
        title.textContent = entry.gathered ? entry.title : "Unknown wild good";

        const kind = document.createElement("p");
        kind.className = "gathered-good__kind";
        kind.textContent = entry.gathered ? (entry.kind === "fruit" ? "Fruit" : "Plant") : "Uncollected";

        const meta = document.createElement("div");
        meta.className = "inventory-holo-card__meta";
        meta.append(zone, kind);

        const body = document.createElement("p");
        body.className = "gathered-good__body";
        body.textContent = entry.gathered
          ? entry.summary
          : "Something small grows here, waiting for Mossu to wander close enough to gather it.";

        content.append(header, art, title, meta, body);
        article.append(foil, sheen, content);
        return article;
      }),
    );
  }

  private buildHud(previewElement: HTMLElement) {
    const hud = document.createElement("div");
    hud.className = "hud";

    const top = document.createElement("div");
    top.className = "hud-top";

    const objective = document.createElement("section");
    objective.className = "objective-chip";
    const eyebrow = document.createElement("p");
    eyebrow.className = "objective-chip__eyebrow";
    eyebrow.textContent = "Quest Log";
    this.statusValues.objectiveTitle.className = "objective-chip__title";
    this.statusValues.objectiveBody.className = "objective-chip__body";
    objective.append(eyebrow, this.statusValues.objectiveTitle, this.statusValues.objectiveBody);

    const status = document.createElement("section");
    status.className = "status-strip";
    status.append(
      this.buildMetric("Area", this.statusValues.zone),
      this.buildMetric("Landmark", this.statusValues.landmark),
      this.buildMetric("Breeze", this.statusValues.wind),
      this.buildMetric("Dex", this.statusValues.collections),
    );

    const bottom = document.createElement("div");
    bottom.className = "hud-bottom";
    const bottomStack = document.createElement("div");
    bottomStack.className = "hud-bottom__stack";
    const utilityStack = document.createElement("div");
    utilityStack.className = "hud-bottom__utility";
    this.statusValues.prompt.className = "prompt-chip";
    this.statusValues.hint.className = "hint-chip";
    this.statusValues.ability.className = "ability-pill";
    bottomStack.append(this.statusValues.prompt, this.buildControlsPanel(), this.statusValues.hint);
    utilityStack.append(this.buildStaminaHud(), this.statusValues.ability);
    bottom.append(bottomStack, utilityStack);

    top.append(objective, status);
    hud.append(top, bottom, this.buildMapOverlay(), this.buildPauseMenu(), this.buildCharacterScreen(previewElement));
    return hud;
  }

  private buildMetric(label: string, value: HTMLElement) {
    const wrapper = document.createElement("div");
    wrapper.className = "status-metric";
    const labelNode = document.createElement("p");
    labelNode.className = "status-label";
    labelNode.textContent = label;
    value.className = "status-value";
    wrapper.append(labelNode, value);
    return wrapper;
  }

  private buildControlsPanel() {
    this.controlsPanel.className = "controls-panel";

    const eyebrow = document.createElement("p");
    eyebrow.className = "controls-panel__eyebrow";
    eyebrow.textContent = "Movement";

    const grid = document.createElement("div");
    grid.className = "controls-panel__grid";

    [
      ["W", "forward"],
      ["A", "left"],
      ["S", "backward"],
      ["D", "right"],
      ["Space", "jump / float"],
      ["Shift", "roll"],
      ["E", "interact"],
      ["Tab", "inventory"],
      ["M", "map"],
      ["Esc", "pause"],
    ].forEach(([key, label]) => {
      const row = document.createElement("div");
      row.className = "controls-panel__row";

      const keyNode = document.createElement("kbd");
      keyNode.className = "controls-panel__key";
      keyNode.textContent = key;

      const labelNode = document.createElement("span");
      labelNode.className = "controls-panel__label";
      labelNode.textContent = label;

      row.append(keyNode, labelNode);
      grid.append(row);
    });

    this.controlsPanelStatus.className = "controls-panel__status";
    this.controlsPanel.append(eyebrow, grid, this.controlsPanelStatus);
    return this.controlsPanel;
  }

  private buildStaminaHud() {
    this.staminaHud.className = "stamina-hud";

    const label = document.createElement("p");
    label.className = "stamina-hud__label";
    label.textContent = "Stamina";

    this.staminaRing.className = "stamina-hud__ring";
    const core = document.createElement("div");
    core.className = "stamina-hud__core";
    this.staminaValue.className = "stamina-hud__value";
    this.staminaValue.textContent = "100";
    core.append(this.staminaValue);
    this.staminaRing.append(core);
    this.staminaHud.append(this.staminaRing, label);
    return this.staminaHud;
  }

  private updateStaminaHud(stamina: number, staminaMax: number, visible: boolean) {
    const staminaRatio = staminaMax <= 0 ? 0 : MathUtils.clamp(stamina / staminaMax, 0, 1);
    this.staminaHud.style.setProperty("--stamina-ratio", staminaRatio.toFixed(3));
    this.staminaValue.textContent = `${Math.round(staminaRatio * 100)}`;
    this.staminaHud.classList.toggle("stamina-hud--visible", visible);
    this.staminaHud.classList.toggle("stamina-hud--low", staminaRatio <= 0.32);
    this.staminaHud.classList.toggle("stamina-hud--empty", staminaRatio <= 0.04);
  }

  private buildCharacterScreen(previewElement: HTMLElement) {
    this.characterScreen.className = "character-screen";

    const shell = document.createElement("div");
    shell.className = "character-screen__shell";

    const aside = document.createElement("section");
    aside.className = "character-screen__aside";
    const eyebrow = document.createElement("p");
    eyebrow.className = "character-screen__eyebrow";
    eyebrow.textContent = "Field Binder";
    const title = document.createElement("h2");
    title.className = "character-screen__title";
    title.textContent = "Mossu Holo Binder";
    this.characterSummary.className = "character-screen__summary";
    this.characterStamp.className = "character-screen__stamp";
    const previewCard = document.createElement("div");
    previewCard.className = "character-screen__preview-card";
    previewCard.append(previewElement);
    this.characterNearby.className = "character-screen__nearby";
    aside.append(eyebrow, title, this.characterSummary, this.characterStamp, previewCard, this.characterNearby);

    const content = document.createElement("div");
    content.className = "character-screen__content";
    const primaryColumn = document.createElement("div");
    primaryColumn.className = "character-screen__column character-screen__column--main";
    const collectionsColumn = document.createElement("div");
    collectionsColumn.className = "character-screen__column character-screen__column--collections";

    const statsSection = this.buildCharacterSection("Stats", "Active field data");
    this.statsGrid.className = "character-stat-grid";
    statsSection.append(this.statsGrid);

    const upgradesSection = this.buildCharacterSection("Abilities", "Known techniques");
    this.upgradesGrid.className = "upgrade-grid";
    upgradesSection.append(this.upgradesGrid);

    const collectionsSection = this.buildCharacterSection("Field Dex", "Registered landmarks", this.collectionsSectionBadge);
    collectionsSection.classList.add("character-section--binder");
    this.collectionsList.className = "collection-list";
    collectionsSection.append(this.collectionsList);

    const gatheredGoodsSection = this.buildCharacterSection("Gathered Goods", "Foraged plants and fruit", this.gatheredGoodsSectionBadge);
    gatheredGoodsSection.classList.add("character-section--binder");
    this.gatheredGoodsList.className = "gathered-goods-list";
    gatheredGoodsSection.append(this.gatheredGoodsList);

    primaryColumn.append(statsSection, upgradesSection);
    collectionsColumn.append(collectionsSection, gatheredGoodsSection);
    content.append(primaryColumn, collectionsColumn);
    shell.append(aside, content);
    this.characterScreen.append(shell);
    return this.characterScreen;
  }

  private buildPauseMenu() {
    this.pauseMenu.className = "pause-menu";

    const shell = document.createElement("div");
    shell.className = "pause-menu__shell";

    const header = document.createElement("header");
    header.className = "pause-menu__header";

    const eyebrow = document.createElement("p");
    eyebrow.className = "pause-menu__eyebrow";
    eyebrow.textContent = "Pause Menu";

    const title = document.createElement("h2");
    title.className = "pause-menu__title";
    title.textContent = "Trail Break";

    this.pauseSummary.className = "pause-menu__summary";
    header.append(eyebrow, title, this.pauseSummary);

    const actions = document.createElement("div");
    actions.className = "pause-menu__actions";
    actions.append(
      this.buildPauseAction("Esc", "Resume", "Drop back into the trail and reacquire the camera when you click the world."),
      this.buildPauseAction("Tab", "Inventory", "Open Mossu's holo-card binder with stats, upgrades, and collections."),
      this.buildPauseAction("M", "Region Map", "Swing out to the high route map without stacking extra HUD on top."),
    );

    const status = document.createElement("div");
    status.className = "pause-menu__status-grid";
    status.append(
      this.buildPauseStat("Area", this.pauseStatusValues.area),
      this.buildPauseStat("Landmark", this.pauseStatusValues.landmark),
      this.buildPauseStat("Breeze", this.pauseStatusValues.breeze),
      this.buildPauseStat("Field Dex", this.pauseStatusValues.collections),
      this.buildPauseStat("Gathered", this.pauseStatusValues.goods),
    );

    shell.append(header, actions, status);
    this.pauseMenu.append(shell);
    return this.pauseMenu;
  }

  private buildPauseAction(keyText: string, titleText: string, bodyText: string) {
    const article = document.createElement("article");
    article.className = "pause-action";

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

  private buildPauseStat(labelText: string, valueNode: HTMLElement) {
    const article = document.createElement("article");
    article.className = "pause-stat";

    const label = document.createElement("p");
    label.className = "pause-stat__label";
    label.textContent = labelText;

    valueNode.className = "pause-stat__value";
    article.append(label, valueNode);
    return article;
  }

  private buildMapOverlay() {
    this.mapOverlay.className = "world-map";

    const shell = document.createElement("div");
    shell.className = "world-map__shell";

    const header = document.createElement("header");
    header.className = "world-map__header";
    const headerTop = document.createElement("div");
    headerTop.className = "world-map__header-top";

    const eyebrow = document.createElement("p");
    eyebrow.className = "world-map__eyebrow";
    eyebrow.textContent = "Region Map";

    this.mapStamp.className = "world-map__stamp";

    const title = document.createElement("h1");
    title.className = "world-map__title";
    title.textContent = "Mossu Region";

    const subtitle = document.createElement("p");
    subtitle.className = "world-map__subtitle";
    subtitle.textContent = "Southern routes stay calm, the river runs through the middle, and the shrine waits at the high northern edge.";

    headerTop.append(eyebrow, this.mapStamp);
    header.append(headerTop, title, subtitle);

    const body = document.createElement("div");
    body.className = "world-map__body";

    const figure = document.createElement("div");
    figure.className = "world-map__figure";
    figure.append(this.buildMapSvg());

    const sidebar = document.createElement("aside");
    sidebar.className = "world-map__sidebar";

    const currentCard = this.buildMapInfoCard("Current Area", this.mapCurrentTitle, this.mapCurrentBody);
    this.mapCurrentTitle.className = "world-map__card-title";
    this.mapCurrentBody.className = "world-map__card-body";

    const routeCard = document.createElement("section");
    routeCard.className = "world-map__card";
    const routeEyebrow = document.createElement("p");
    routeEyebrow.className = "world-map__card-eyebrow";
    routeEyebrow.textContent = "Route Log";
    const routeList = document.createElement("ol");
    routeList.className = "world-map__route-list";
    routeLandmarks.forEach((landmark) => {
      const step = document.createElement("li");
      step.className = "world-map__route-step";

      const badge = document.createElement("span");
      badge.className = "world-map__route-badge";
      badge.textContent = String(routeList.children.length + 1);

      const copy = document.createElement("span");
      copy.className = "world-map__route-copy";
      copy.textContent = landmark.title;

      step.append(badge, copy);
      routeList.append(step);
      this.mapRouteSteps.set(landmark.id, step);
    });

    this.mapNextStop.className = "world-map__card-body world-map__card-body--route";
    routeCard.append(routeEyebrow, routeList, this.mapNextStop);

    const legendCard = document.createElement("section");
    legendCard.className = "world-map__card";
    const legendEyebrow = document.createElement("p");
    legendEyebrow.className = "world-map__card-eyebrow";
    legendEyebrow.textContent = "Map Key";
    this.mapCollectionsSummary.className = "world-map__card-body";
    const legend = document.createElement("div");
    legend.className = "world-map__legend";
    legend.append(
      this.buildLegendRow("world-map__legend-swatch world-map__legend-swatch--player", "Mossu's live position"),
      this.buildLegendRow("world-map__legend-swatch world-map__legend-swatch--shrine", "Moss Crown Shrine"),
      this.buildLegendRow("world-map__legend-swatch world-map__legend-swatch--seen", "Mapped keepsake landmarks"),
      this.buildLegendRow("world-map__legend-swatch world-map__legend-swatch--unseen", "Unvisited route markers"),
    );
    legendCard.append(legendEyebrow, this.mapCollectionsSummary, legend);

    sidebar.append(currentCard, routeCard, legendCard);
    body.append(figure, sidebar);

    const footer = document.createElement("div");
    footer.className = "world-map__footer";
    footer.textContent = "Press M or Esc to close the map.";

    shell.append(header, body, footer);
    this.mapOverlay.append(shell);
    return this.mapOverlay;
  }

  private buildMapSvg() {
    this.mapSvg.classList.add("world-map__svg");
    this.mapSvg.setAttribute("viewBox", `0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`);
    this.mapSvg.setAttribute("role", "presentation");

    const defs = createSvgElement("defs");

    const islandGradient = createSvgElement("linearGradient");
    islandGradient.id = "world-map-island-gradient";
    islandGradient.setAttribute("x1", "0%");
    islandGradient.setAttribute("y1", "100%");
    islandGradient.setAttribute("x2", "0%");
    islandGradient.setAttribute("y2", "0%");
    [
      ["0%", "#dcefb1"],
      ["38%", "#c7df95"],
      ["67%", "#9ab57c"],
      ["100%", "#7d9280"],
    ].forEach(([offset, color]) => {
      const stop = createSvgElement("stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      islandGradient.append(stop);
    });

    const riverGradient = createSvgElement("linearGradient");
    riverGradient.id = "world-map-river-gradient";
    riverGradient.setAttribute("x1", "0%");
    riverGradient.setAttribute("y1", "100%");
    riverGradient.setAttribute("x2", "0%");
    riverGradient.setAttribute("y2", "0%");
    [
      ["0%", "#78b5b8"],
      ["100%", "#c8dfc5"],
    ].forEach(([offset, color]) => {
      const stop = createSvgElement("stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      riverGradient.append(stop);
    });

    const islandClip = createSvgElement("clipPath");
    islandClip.id = "world-map-island-clip";
    const clipPath = createSvgElement("path");
    clipPath.setAttribute("d", mapBoundaryPath);
    islandClip.append(clipPath);

    defs.append(islandGradient, riverGradient, islandClip);
    this.mapSvg.append(defs);

    const islandShadow = createSvgElement("path");
    islandShadow.classList.add("world-map__island-shadow");
    islandShadow.setAttribute("d", mapBoundaryPath);
    islandShadow.setAttribute("transform", "translate(16 20)");

    const island = createSvgElement("path");
    island.classList.add("world-map__island-shape");
    island.setAttribute("d", mapBoundaryPath);

    const pocketGroup = createSvgElement("g");
    pocketGroup.setAttribute("clip-path", "url(#world-map-island-clip)");
    routeLandmarks.forEach((landmark) => {
      const pocket = createSvgElement("circle");
      pocket.classList.add("world-map__route-pocket");
      const point = projectWorldToMap(landmark.position.x, landmark.position.z);
      pocket.setAttribute("cx", point.x.toFixed(1));
      pocket.setAttribute("cy", point.y.toFixed(1));
      pocket.setAttribute("r", landmark.id === "peak-shrine" ? "44" : "34");
      if (landmark.id === "peak-shrine") {
        pocket.classList.add("world-map__route-pocket--shrine");
      }
      pocketGroup.append(pocket);
    });

    const river = createSvgElement("path");
    river.classList.add("world-map__river");
    river.setAttribute("d", mapRiverPath);

    const riverBranches = createSvgElement("g");
    riverBranches.classList.add("world-map__river-branches");
    mapRiverBranchPaths.forEach((path) => {
      const branch = createSvgElement("path");
      branch.classList.add("world-map__river", "world-map__river--branch");
      branch.setAttribute("d", path);
      riverBranches.append(branch);
    });

    const route = createSvgElement("path");
    route.classList.add("world-map__route");
    route.setAttribute("d", mapRoutePath);

    const landmarkLayer = createSvgElement("g");
    landmarkLayer.classList.add("world-map__landmark-layer");
    worldLandmarks.forEach((landmark) => {
      const marker = this.createMapLandmarkMarker(landmark);
      landmarkLayer.append(marker.group);
      this.mapLandmarkMarkers.set(landmark.id, marker);
    });
    landmarkLayer.append(this.mapPlayerMarker.group);

    this.mapSvg.append(
      islandShadow,
      island,
      pocketGroup,
      river,
      riverBranches,
      route,
      this.createMapCompass(),
      landmarkLayer,
    );
    return this.mapSvg;
  }

  private buildLegendRow(swatchClassName: string, labelText: string) {
    const row = document.createElement("div");
    row.className = "world-map__legend-row";
    const swatch = document.createElement("span");
    swatch.className = swatchClassName;
    const label = document.createElement("span");
    label.className = "world-map__legend-label";
    label.textContent = labelText;
    row.append(swatch, label);
    return row;
  }

  private buildMapInfoCard(eyebrowText: string, title: HTMLElement, body: HTMLElement) {
    const card = document.createElement("section");
    card.className = "world-map__card";

    const eyebrow = document.createElement("p");
    eyebrow.className = "world-map__card-eyebrow";
    eyebrow.textContent = eyebrowText;

    card.append(eyebrow, title, body);
    return card;
  }

  private createMapPlayerMarker() {
    const group = createSvgElement("g");
    group.classList.add("world-map__marker", "world-map__marker--player");

    const ring = createSvgElement("circle");
    ring.setAttribute("r", "16");

    const dot = createSvgElement("circle");
    dot.setAttribute("r", "7");

    group.append(ring, dot);
    return { group, ring, dot };
  }

  private createMapLandmarkMarker(landmark: WorldLandmark): MapMarkerElements {
    const point = projectWorldToMap(landmark.position.x, landmark.position.z);
    const layout = getMapLabelLayout(landmark.id);

    const group = createSvgElement("g");
    group.classList.add("world-map__marker");
    group.setAttribute("transform", `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
    if (landmark.id === "peak-shrine") {
      group.classList.add("world-map__marker--shrine");
    }

    const ring = createSvgElement("circle");
    ring.setAttribute("r", landmark.id === "peak-shrine" ? "13" : "10");

    const dot = createSvgElement("circle");
    dot.setAttribute("r", landmark.id === "peak-shrine" ? "5.8" : "4.6");

    const label = createSvgElement("text");
    label.classList.add("world-map__marker-label");
    label.setAttribute("x", `${layout.dx}`);
    label.setAttribute("y", `${layout.dy}`);
    label.setAttribute("text-anchor", layout.anchor);
    label.textContent = landmark.title;

    group.append(ring, dot, label);

    return { group, ring, dot, label };
  }

  private createMapCompass() {
    const group = createSvgElement("g");
    group.classList.add("world-map__compass");
    group.setAttribute("transform", "translate(842 126)");

    const ring = createSvgElement("circle");
    ring.setAttribute("r", "34");

    const needleNorth = createSvgElement("path");
    needleNorth.setAttribute("d", "M 0 -28 L 8 0 L 0 -6 L -8 0 Z");

    const needleSouth = createSvgElement("path");
    needleSouth.setAttribute("d", "M 0 28 L 8 0 L 0 6 L -8 0 Z");

    const crossVertical = createSvgElement("line");
    crossVertical.setAttribute("x1", "0");
    crossVertical.setAttribute("y1", "-22");
    crossVertical.setAttribute("x2", "0");
    crossVertical.setAttribute("y2", "22");

    const crossHorizontal = createSvgElement("line");
    crossHorizontal.setAttribute("x1", "-22");
    crossHorizontal.setAttribute("y1", "0");
    crossHorizontal.setAttribute("x2", "22");
    crossHorizontal.setAttribute("y2", "0");

    const northLabel = createSvgElement("text");
    northLabel.setAttribute("x", "0");
    northLabel.setAttribute("y", "-42");
    northLabel.textContent = "N";

    const eastLabel = createSvgElement("text");
    eastLabel.setAttribute("x", "42");
    eastLabel.setAttribute("y", "5");
    eastLabel.textContent = "E";

    const southLabel = createSvgElement("text");
    southLabel.setAttribute("x", "0");
    southLabel.setAttribute("y", "52");
    southLabel.textContent = "S";

    const westLabel = createSvgElement("text");
    westLabel.setAttribute("x", "-42");
    westLabel.setAttribute("y", "5");
    westLabel.textContent = "W";

    group.append(
      ring,
      crossVertical,
      crossHorizontal,
      needleNorth,
      needleSouth,
      northLabel,
      eastLabel,
      southLabel,
      westLabel,
    );
    return group;
  }

  private updateMapOverlay(frame: FrameState, characterData: CharacterScreenView, viewMode: ViewMode) {
    const mapOpen = viewMode === "map_lookdown";
    this.mapOverlay.classList.toggle("world-map--open", mapOpen);
    if (!mapOpen) {
      return;
    }

    const playerPoint = projectWorldToMap(frame.player.position.x, frame.player.position.z);
    this.mapPlayerMarker.group.setAttribute("transform", `translate(${playerPoint.x.toFixed(1)} ${playerPoint.y.toFixed(1)})`);

    const currentLandmarkId = worldLandmarks.find((landmark) => landmark.title === frame.currentLandmark)?.id ?? null;
    const currentRouteLandmark = currentLandmarkId
      ? routeLandmarks.find((landmark) => landmark.id === currentLandmarkId) ?? null
      : null;
    const nextRouteLandmark = routeLandmarks.find((landmark) => !frame.save.catalogedLandmarkIds.has(landmark.id)) ?? null;

    this.mapCurrentTitle.textContent = frame.currentLandmark;
    this.mapCurrentBody.textContent = `${this.prettyZone(frame.currentZone)} pocket. ${this.describeMapRegion(frame.currentZone)}`;
    const completedRouteCount = routeLandmarks.filter((landmark) => frame.save.catalogedLandmarkIds.has(landmark.id)).length;
    this.mapNextStop.textContent = currentRouteLandmark && !frame.save.catalogedLandmarkIds.has(currentRouteLandmark.id)
      ? `Current stop: ${currentRouteLandmark.title}. Route progress ${completedRouteCount}/${routeLandmarks.length}. Drift through it to stamp the climb, then keep following the river north.`
      : nextRouteLandmark
        ? `Next stop: ${nextRouteLandmark.title}. Route progress ${completedRouteCount}/${routeLandmarks.length}. Follow the river north and stay on the marked route.`
        : `Route complete. Mossu has already mapped the whole climb to the shrine with ${characterData.gatheredTotals.gathered} goods tucked away.`;
    this.mapCollectionsSummary.textContent = `${characterData.totals.discovered}/${characterData.totals.total} field notes logged and ${characterData.gatheredTotals.gathered}/${characterData.gatheredTotals.total} goods gathered so far.`;
    this.mapStamp.textContent = `${characterData.totals.discovered} notes · ${characterData.gatheredTotals.gathered} goods`;

    this.mapRouteSteps.forEach((step, landmarkId) => {
      step.classList.toggle("world-map__route-step--complete", frame.save.catalogedLandmarkIds.has(landmarkId));
      step.classList.toggle("world-map__route-step--current", landmarkId === currentLandmarkId);
    });

    this.mapLandmarkMarkers.forEach((marker, landmarkId) => {
      const discovered = frame.save.catalogedLandmarkIds.has(landmarkId);
      marker.group.classList.toggle("world-map__marker--discovered", discovered);
      marker.group.classList.toggle("world-map__marker--current", landmarkId === currentLandmarkId);
    });
  }

  private describeMapRegion(zone: string) {
    if (zone === "plains" || zone === "hills") {
      return "The warm lower meadows stay open and flower-heavy before the climb narrows.";
    }
    if (zone === "foothills") {
      return "This is the hinge of the island, where round trees thin out and the first pines take over.";
    }
    if (zone === "alpine") {
      return "The route turns airy here, with colder shelves, runoff channels, and lighter footing.";
    }
    if (zone === "ridge") {
      return "The high crossing is sparse and exposed, with long looks back across the whole floating island.";
    }
    return "The shrine plateau is the quiet crown of the route, above the rest of the climb.";
  }

  private buildCharacterSection(titleText: string, eyebrowText: string, badgeNode?: HTMLElement) {
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

  private prettyZone(zone: string) {
    return zone.replace("_", " ");
  }

  private binderZoneCode(zone: string) {
    return this.prettyZone(zone)
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .slice(0, 3)
      .toUpperCase();
  }

  private renderQuickActions(actions: Array<[string, string]>) {
    return `<span class="quick-actions">${actions.map(([key, label]) => `<span class="quick-actions__item"><kbd>${key}</kbd><span>${label}</span></span>`).join("")}</span>`;
  }
}

import { MathUtils } from "three";
import type { CharacterScreenView } from "../../simulation/characterScreenData";
import { MOVEMENT_CONTROL_LABELS, MOVEMENT_CONTROL_SUMMARY } from "../../simulation/controlScheme";
import type { FrameState } from "../../simulation/gameState";
import { ROLL_MODE_INDICATOR_DELAY } from "../../simulation/playerSimulationConstants";
import { worldLandmarks } from "../../simulation/world";
import type { ForageableKind, WorldLandmark } from "../../simulation/world";
import { ViewMode } from "../../simulation/viewMode";
import {
  buildMapNorthRidgePath,
  createSvgElement,
  getMapLabelLayout,
  mapAtlasMarkers,
  mapBoundaryPath,
  mapForestGlyphs,
  mapHighlandBackdrop,
  mapLakePatches,
  mapMountainRidgePaths,
  mapRegionPatches,
  mapRiverBranchPaths,
  mapRiverPath,
  mapRoutePath,
  MapMarkerElements,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_WIDTH,
  projectWorldToMap,
  routeLandmarkIdSet,
  routeLandmarks,
} from "./worldMap";

const POUCH_KIND_ORDER: ForageableKind[] = ["seed", "shell", "moss_tuft", "berry", "smooth_stone", "feather"];
const POUCH_REVEAL_MS = 4200;
const PICKUP_CARD_MS = 2200;
type BinderSectionId = "profile" | "cards" | "pouch";
type PauseCommandId = "resume" | "handbook" | "map";

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
    rollingCount: number;
    mossuCollisionCount: number;
    dominantMood: "curious" | "shy" | "brave" | "sleepy";
    regroupActive: boolean;
    callHeardActive: boolean;
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
  private readonly rollModeHud = document.createElement("section");
  private readonly rollModeMeter = document.createElement("div");
  private readonly rollModeValue = document.createElement("p");
  private readonly pouchHud = document.createElement("section");
  private readonly pouchItems = document.createElement("div");
  private readonly pouchDetail = document.createElement("div");
  private readonly pouchDetailTitle = document.createElement("p");
  private readonly pouchDetailBody = document.createElement("p");
  private readonly pickupCard = document.createElement("section");
  private readonly pickupCardArt = document.createElement("div");
  private readonly pickupCardSymbol = document.createElement("span");
  private readonly pickupCardTitle = document.createElement("p");
  private readonly pickupCardKind = document.createElement("p");
  private readonly pickupCardMeta = document.createElement("p");
  private readonly pickupCardSummary = document.createElement("p");
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
  private readonly binderTabs = new Map<BinderSectionId, HTMLButtonElement>();
  private readonly binderSections = new Map<BinderSectionId, HTMLElement>();
  private characterScreenSignature = "";
  private activeBinderSection: BinderSectionId = "cards";
  private latestPouchGatheredId: string | null = null;
  private pouchRevealUntil = 0;
  private latestPickupCardId: string | null = null;
  private pickupCardHideAt = 0;
  private pickupCardKindClass: string | null = null;
  private selectedPouchKind: ForageableKind | null = null;
  private pouchSignature = "";
  private readonly handleInventoryCardPointerMove = (event: PointerEvent) => {
    if (!(event.currentTarget instanceof HTMLElement)) {
      return;
    }

    const card = event.currentTarget;
    const bounds = card.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const x = MathUtils.clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = MathUtils.clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    const tiltX = (0.5 - y) * 4.4;
    const tiltY = (x - 0.5) * 5.2;

    card.style.setProperty("--card-tilt-x", `${tiltX.toFixed(2)}deg`);
    card.style.setProperty("--card-tilt-y", `${tiltY.toFixed(2)}deg`);
    card.style.setProperty("--card-glare-x", `${(x * 100).toFixed(1)}%`);
    card.style.setProperty("--card-glare-y", `${(y * 100).toFixed(1)}%`);
  };
  private readonly handleInventoryCardPointerLeave = (event: PointerEvent) => {
    if (!(event.currentTarget instanceof HTMLElement)) {
      return;
    }

    this.resetInventoryCardMotion(event.currentTarget);
  };
  private readonly handleInventoryCardFocus = (event: FocusEvent) => {
    if (!(event.currentTarget instanceof HTMLElement)) {
      return;
    }

    const card = event.currentTarget;
    card.style.setProperty("--card-tilt-x", "-1.7deg");
    card.style.setProperty("--card-tilt-y", "2.2deg");
    card.style.setProperty("--card-glare-x", "62%");
    card.style.setProperty("--card-glare-y", "22%");
  };
  private readonly handleInventoryCardBlur = (event: FocusEvent) => {
    if (!(event.currentTarget instanceof HTMLElement)) {
      return;
    }

    this.resetInventoryCardMotion(event.currentTarget);
  };

  private resetInventoryCardMotion(card: HTMLElement) {
    card.style.removeProperty("--card-tilt-x");
    card.style.removeProperty("--card-tilt-y");
    card.style.removeProperty("--card-glare-x");
    card.style.removeProperty("--card-glare-y");
  }
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
  private readonly flavorPingToast = document.createElement("p");
  private flavorPingHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(previewElement: HTMLElement) {
    this.element = this.buildHud(previewElement);
  }

  showFlavorPing(text: string) {
    if (this.flavorPingHideTimer !== null) {
      clearTimeout(this.flavorPingHideTimer);
      this.flavorPingHideTimer = null;
    }
    this.flavorPingToast.textContent = text;
    this.flavorPingToast.classList.add("hud-flavor-ping--visible");
    this.flavorPingHideTimer = setTimeout(() => {
      this.flavorPingToast.classList.remove("hud-flavor-ping--visible");
      this.flavorPingHideTimer = null;
    }, 3600);
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
    const nearbyForageable = frame.forageableTarget;
    const faunaName = fauna.speciesName;
    const nearbyRecruitableFauna =
      fauna.nearestRecruitableDistance !== null &&
      fauna.nearestRecruitableDistance <= 14.5;
    const shouldShowControlsPanel = pauseMenuOpen || characterScreenOpen;
    const overlayOpen = isMapMode || pauseMenuOpen || characterScreenOpen;

    this.statusValues.zone.textContent = this.prettyZone(frame.currentZone);
    this.statusValues.landmark.textContent = frame.currentLandmark;
    this.statusValues.wind.textContent = `${Math.round(windStrength * 100)}%`;
    this.statusValues.collections.textContent = `${characterData.totals.discovered}/${characterData.totals.total}`;
    this.updateStaminaHud(frame.player.stamina, frame.player.staminaMax, frame.player.staminaVisible);
    this.updateRollModeHud(frame.player.rollHoldSeconds, frame.player.rollModeReady, frame.player.rolling, overlayOpen);
    this.element.classList.toggle("hud--map", isMapMode);
    this.element.classList.toggle("hud--pause", pauseMenuOpen);
    this.element.classList.toggle("hud--character-screen", characterScreenOpen);
    this.pauseMenu.classList.toggle("pause-menu--open", pauseMenuOpen);
    this.characterScreen.classList.toggle("character-screen--open", characterScreenOpen);
    this.controlsPanel.classList.toggle("controls-panel--visible", shouldShowControlsPanel);
    this.updateMapOverlay(frame, characterData, viewMode);
    this.updatePauseMenu(frame, characterData, windStrength);
    this.updateCharacterScreen(characterData, focusedCollectionId, characterScreenOpen);
    this.updatePouchHud(characterData, nearbyForageable?.kind ?? null, latestGatheredGood?.forageableId ?? null, overlayOpen);
    this.updatePickupCard(latestGatheredGood ?? null, overlayOpen);

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
      this.statusValues.objectiveTitle.textContent = "World View";
      this.statusValues.objectiveBody.textContent = "The camera is pulled high above the island so the full route can breathe on screen.";
      this.statusValues.ability.textContent = "Map view.";
      this.statusValues.prompt.innerHTML = "<strong>World View</strong>";
      this.controlsPanelStatus.innerHTML =
        "Scroll to zoom the island view. Press <strong>R</strong> or <strong>Home</strong> to reset zoom. <strong>M</strong> or <strong>Esc</strong> returns to the trail.";
      this.statusValues.hint.innerHTML = this.renderQuickActions([
        ["Tab", "inventory"],
        ["R / Home", "reset zoom"],
        ["M", "close"],
        ["Esc", "close"],
      ]);
      return;
    }

    this.statusValues.objectiveTitle.textContent = frame.objective.title;
    this.statusValues.objectiveBody.textContent = frame.objective.body;
    this.statusValues.ability.textContent = frame.player.floating
      ? "Breeze Float active: Mossu is riding the wind."
      : frame.player.rollModeReady
      ? "Roll mode active: jump, then hold Q or Space to Breeze Float."
      : "Ability ready: hold Q in the air, or keep Space held after jumping.";

    const faunaMoodIcon = this.renderFaunaMoodIcon(fauna.dominantMood);
    const faunaMoodLabel = `${fauna.dominantMood[0].toUpperCase()}${fauna.dominantMood.slice(1)}`;

    const hasContextPrompt =
      characterScreenOpen ||
      latestGatheredGood !== undefined ||
      latestCollection !== undefined ||
      nearbyForageable !== null ||
      fauna.recruitedThisFrame > 0 ||
      fauna.rollingCount > 0 ||
      (fauna.callHeardActive && fauna.recruitedCount > 0) ||
      (fauna.regroupActive && fauna.recruitedCount > 0) ||
      nearbyRecruitableFauna ||
      fauna.recruitedCount > 0 ||
      nearbyCollection !== undefined;

    this.statusValues.prompt.classList.toggle("prompt-chip--ambient", !hasContextPrompt);
    this.statusValues.hint.classList.toggle("hint-chip--ambient", pointerLocked && !hasContextPrompt);
    this.statusValues.ability.classList.toggle("ability-pill--quiet", !frame.player.staminaVisible);

    if (characterScreenOpen) {
      this.statusValues.prompt.innerHTML = "<strong>Inventory</strong> Tab or Esc closes Mossu's holo binder.";
    } else if (latestGatheredGood) {
      this.statusValues.prompt.innerHTML = `<strong>Foraged</strong> ${latestGatheredGood.title} was tucked into Mossu's gather pouch.`;
    } else if (latestCollection) {
      this.statusValues.prompt.innerHTML = `<strong>New Entry</strong> ${latestCollection.keepsakeTitle} was registered in Mossu's field log.`;
    } else if (nearbyForageable) {
      this.statusValues.prompt.innerHTML = `<strong>Forage</strong> Press E to tuck ${nearbyForageable.title} into Mossu's pouch.`;
    } else if (fauna.recruitedThisFrame > 0) {
      this.statusValues.prompt.innerHTML = `${faunaMoodIcon}<span><strong>${faunaName}</strong> ${fauna.recruitedThisFrame} ${faunaName} joined Mossu's trail.</span>`;
    } else if (fauna.rollingCount > 0) {
      this.statusValues.prompt.innerHTML = `${faunaMoodIcon}<span><strong>${faunaName}</strong> ${fauna.rollingCount} rolling with Mossu.</span>`;
    } else if (fauna.callHeardActive && fauna.recruitedCount > 0) {
      this.statusValues.prompt.innerHTML = `${faunaMoodIcon}<span><strong>${faunaName}</strong> heard Mossu.</span>`;
    } else if (fauna.regroupActive && fauna.recruitedCount > 0) {
      this.statusValues.prompt.innerHTML = `${faunaMoodIcon}<span><strong>${faunaName}</strong> hopping back in a little wave.</span>`;
    } else if (nearbyRecruitableFauna) {
      this.statusValues.prompt.innerHTML = `${faunaMoodIcon}<span><strong>${faunaName}</strong> Press E to have them follow Mossu.</span>`;
    } else if (fauna.recruitedCount > 0) {
      this.statusValues.prompt.innerHTML = `${faunaMoodIcon}<span><strong>${faunaName}</strong> ${fauna.recruitedCount} following. ${faunaMoodLabel} mood. Hold E to call them in.</span>`;
    } else if (nearbyCollection) {
      this.statusValues.prompt.innerHTML = `<strong>Nearby Landmark</strong> ${nearbyCollection.landmarkTitle} will register automatically when Mossu reaches it.`;
    } else {
      this.statusValues.prompt.innerHTML = "<strong>Trail</strong> Tab handbook · M map · Esc rest";
    }

    if (characterScreenOpen) {
      this.controlsPanelStatus.innerHTML = "Movement pauses while the inventory is open. Press <strong>Tab</strong> or <strong>Esc</strong> to get back outside.";
    } else if (pointerLocked) {
      this.controlsPanelStatus.innerHTML = `${MOVEMENT_CONTROL_SUMMARY}. Mouse look is active, the wheel zooms, and <strong>Esc</strong> pauses.`;
    } else {
      this.controlsPanelStatus.innerHTML = `Click the world to look around. ${MOVEMENT_CONTROL_SUMMARY}.`;
    }

    this.statusValues.hint.innerHTML = this.renderQuickActions(
      pointerLocked
        ? [
            ["Tab", "inventory"],
            ["M", "map"],
            ["Esc", "pause"],
          ]
        : [
            ["Click", "camera"],
            ["W/A/S/D", "move"],
            ["Space", "jump"],
            ["E", "interact"],
            ["Tab", "inventory"],
          ],
    );
  }

  private updatePickupCard(latestGatheredGood: CharacterScreenView["gatheredGoods"][number] | null, overlayOpen: boolean) {
    const now = performance.now();
    if (
      latestGatheredGood &&
      latestGatheredGood.gathered &&
      latestGatheredGood.forageableId !== this.latestPickupCardId
    ) {
      this.latestPickupCardId = latestGatheredGood.forageableId;
      this.pickupCardHideAt = now + PICKUP_CARD_MS;
      this.pickupCardTitle.textContent = latestGatheredGood.title;
      this.pickupCardKind.textContent = this.formatForageableKind(latestGatheredGood.kind);
      this.pickupCardMeta.textContent = `${this.prettyZone(latestGatheredGood.zone)} field card`;
      this.pickupCardSummary.textContent = `${latestGatheredGood.title} logged to Mossu's holo binder.`;
      this.pickupCardSymbol.textContent = this.formatForageableSymbol(latestGatheredGood.kind);
      this.pickupCard.setAttribute("aria-label", `${latestGatheredGood.title} logged to Mossu's holo binder`);

      if (this.pickupCardKindClass) {
        this.pickupCardArt.classList.remove(this.pickupCardKindClass);
      }
      this.pickupCardKindClass = `inventory-holo-card__art--${latestGatheredGood.kind}`;
      this.pickupCardArt.classList.add(this.pickupCardKindClass);

      this.pickupCard.classList.remove("pickup-card--visible");
      // Restart the entrance/slide animation when consecutive goods are gathered.
      void this.pickupCard.offsetWidth;
      this.pickupCard.classList.add("pickup-card--visible");
    }

    const visible = !overlayOpen && now < this.pickupCardHideAt;
    this.pickupCard.classList.toggle("pickup-card--visible", visible);
  }

  private updatePouchHud(
    characterData: CharacterScreenView,
    nearbyKind: ForageableKind | null,
    latestGatheredId: string | null,
    overlayOpen: boolean,
  ) {
    if (latestGatheredId && latestGatheredId !== this.latestPouchGatheredId) {
      this.latestPouchGatheredId = latestGatheredId;
      this.pouchRevealUntil = performance.now() + POUCH_REVEAL_MS;
    }

    const gatheredCounts = new Map<ForageableKind, number>();
    characterData.gatheredGoods.forEach((entry) => {
      if (!entry.gathered) {
        return;
      }
      gatheredCounts.set(entry.kind, (gatheredCounts.get(entry.kind) ?? 0) + 1);
    });

    const visibleKinds = POUCH_KIND_ORDER.filter((kind) => (gatheredCounts.get(kind) ?? 0) > 0 || kind === nearbyKind);
    const shouldShow =
      !overlayOpen &&
      visibleKinds.length > 0 &&
      (nearbyKind !== null || performance.now() < this.pouchRevealUntil);
    if (this.selectedPouchKind && !visibleKinds.includes(this.selectedPouchKind)) {
      this.selectedPouchKind = null;
    }
    const focusedKind = this.selectedPouchKind ?? nearbyKind ?? visibleKinds[0] ?? null;
    const shouldExpand = shouldShow && focusedKind !== null && (this.selectedPouchKind !== null || nearbyKind !== null);
    const signature = [
      shouldShow ? "show" : "hide",
      shouldExpand ? "expanded" : "compact",
      nearbyKind ?? "none",
      focusedKind ?? "none",
      ...POUCH_KIND_ORDER.map((kind) => `${kind}:${gatheredCounts.get(kind) ?? 0}:${visibleKinds.includes(kind) ? 1 : 0}`),
    ].join("|");

    this.pouchHud.classList.toggle("pouch-hud--visible", shouldShow);
    this.pouchHud.classList.toggle("pouch-hud--nearby", nearbyKind !== null);
    this.pouchHud.classList.toggle("pouch-hud--expanded", shouldExpand);
    if (signature === this.pouchSignature) {
      return;
    }

    this.pouchSignature = signature;
    this.pouchItems.replaceChildren(
      ...visibleKinds.map((kind) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = [
          "pouch-hud__item",
          `pouch-hud__item--${kind}`,
          kind === nearbyKind ? "pouch-hud__item--nearby" : "",
          kind === focusedKind ? "pouch-hud__item--selected" : "",
        ].join(" ");
        chip.setAttribute("aria-pressed", kind === this.selectedPouchKind ? "true" : "false");
        chip.setAttribute("aria-label", `${this.formatForageableKind(kind)}: ${gatheredCounts.get(kind) ?? 0} gathered`);
        chip.addEventListener("pointerenter", () => {
          this.selectedPouchKind = kind;
          this.pouchSignature = "";
        });
        chip.addEventListener("focus", () => {
          this.selectedPouchKind = kind;
          this.pouchSignature = "";
        });
        chip.addEventListener("click", () => {
          this.selectedPouchKind = this.selectedPouchKind === kind ? null : kind;
          this.pouchSignature = "";
        });

        const label = document.createElement("span");
        label.className = "pouch-hud__label";
        label.textContent = this.formatForageableKind(kind);

        const count = document.createElement("span");
        count.className = "pouch-hud__count";
        count.textContent = String(gatheredCounts.get(kind) ?? 0);

        chip.append(label, count);
        return chip;
      }),
    );

    if (focusedKind) {
      const count = gatheredCounts.get(focusedKind) ?? 0;
      this.pouchDetailTitle.textContent = this.formatForageableKind(focusedKind);
      this.pouchDetailBody.textContent = focusedKind === nearbyKind
        ? count > 0
          ? `Nearby. Press E to tuck another into Mossu's pouch.`
          : `Nearby. Press E to tuck the first one into Mossu's pouch.`
        : count > 0
          ? `${count} tucked away. Tab opens the binder cards.`
          : "Not gathered yet.";
    } else {
      this.pouchDetailTitle.textContent = "";
      this.pouchDetailBody.textContent = "";
    }
  }

  private renderFaunaMoodIcon(mood: HudShellUpdate["fauna"]["dominantMood"]) {
    return `<span class="karu-mood-icon karu-mood-icon--${mood}" aria-hidden="true"></span>`;
  }

  private updatePauseMenu(frame: FrameState, characterData: CharacterScreenView, windStrength: number) {
    this.pauseSummary.textContent = `Mossu is resting in ${this.prettyZone(frame.currentZone)} with ${characterData.totals.discovered} field notes stamped and ${characterData.gatheredTotals.gathered} pouch goods gathered.`;
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

    this.characterSummary.textContent =
      characterData.totals.discovered === 0 && characterData.gatheredTotals.gathered === 0
        ? "Mossu's holo binder lists every keepsake and pouch good on the route. Stamps register when you reach landmarks; trail finds log when you gather."
        : `Mossu's handbook is still filling in. ${characterData.totals.discovered} of ${characterData.totals.total} keepsake cards have been stamped, and ${characterData.gatheredTotals.gathered} of ${characterData.gatheredTotals.total} pouch goods have been gathered so far.`;
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
        article.tabIndex = 0;
        article.setAttribute(
          "aria-label",
          entry.discovered
            ? `${entry.keepsakeTitle}, ${entry.landmarkTitle}, logged keepsake card`
            : `${entry.landmarkTitle}, hidden keepsake card`,
        );
        article.addEventListener("pointermove", this.handleInventoryCardPointerMove);
        article.addEventListener("pointerleave", this.handleInventoryCardPointerLeave);
        article.addEventListener("focus", this.handleInventoryCardFocus);
        article.addEventListener("blur", this.handleInventoryCardBlur);

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
        article.tabIndex = 0;
        article.setAttribute(
          "aria-label",
          entry.gathered
            ? `${entry.title}, ${this.formatForageableKind(entry.kind)}, gathered pouch good`
            : `${this.prettyZone(entry.zone)}, unknown pouch good`,
        );
        article.addEventListener("pointermove", this.handleInventoryCardPointerMove);
        article.addEventListener("pointerleave", this.handleInventoryCardPointerLeave);
        article.addEventListener("focus", this.handleInventoryCardFocus);
        article.addEventListener("blur", this.handleInventoryCardBlur);

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
        artLabel.textContent = entry.gathered ? this.formatForageableKind(entry.kind) : "???";
        art.append(artLabel);

        const zone = document.createElement("p");
        zone.className = "gathered-good__zone";
        zone.textContent = this.prettyZone(entry.zone);

        const title = document.createElement("h3");
        title.className = "gathered-good__title";
        title.textContent = entry.gathered ? entry.title : "Unknown wild good";

        const kind = document.createElement("p");
        kind.className = "gathered-good__kind";
        kind.textContent = entry.gathered ? this.formatForageableKind(entry.kind) : "Uncollected";

        const meta = document.createElement("div");
        meta.className = "inventory-holo-card__meta";
        meta.append(zone, kind);

        const body = document.createElement("p");
        body.className = "gathered-good__body";
        body.textContent = entry.gathered
          ? entry.summary
          : "Something small waits here for Mossu to pick up and tuck into the gather pouch.";

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

    const status = document.createElement("section");
    status.className = "status-strip";
    status.append(
      this.buildMetric("Area", this.statusValues.zone, "area"),
      this.buildMetric("Landmark", this.statusValues.landmark, "landmark"),
      this.buildMetric("Breeze", this.statusValues.wind, "breeze"),
      this.buildMetric("Cards", this.statusValues.collections, "cards"),
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
    utilityStack.append(this.buildPouchHud(), this.buildRollModeHud(), this.buildStaminaHud(), this.statusValues.ability);
    bottom.append(bottomStack, utilityStack);

    top.append(status);

    this.flavorPingToast.className = "hud-flavor-ping";
    this.flavorPingToast.setAttribute("role", "status");
    this.flavorPingToast.setAttribute("aria-live", "polite");

    const buildMeta = document.createElement("div");
    buildMeta.className = "hud-build-meta";
    buildMeta.textContent = `v${__MOSSU_VERSION__} · ${__MOSSU_BUILD_TIME__.slice(0, 10)}`;
    buildMeta.title = `Build ${__MOSSU_BUILD_TIME__}`;
    buildMeta.setAttribute("aria-hidden", "true");

    hud.append(
      top,
      this.flavorPingToast,
      bottom,
      buildMeta,
      this.buildPickupCard(),
      this.buildMapOverlay(),
      this.buildPauseMenu(),
      this.buildCharacterScreen(previewElement),
    );
    return hud;
  }

  private buildMetric(label: string, value: HTMLElement, kind: "area" | "landmark" | "breeze" | "cards") {
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

  private buildPickupCard() {
    this.pickupCard.className = "pickup-card inventory-holo-card inventory-holo-card--tone-2";
    this.pickupCard.setAttribute("aria-live", "polite");
    this.pickupCard.setAttribute("aria-label", "Gathered item logged");

    const foil = document.createElement("div");
    foil.className = "inventory-holo-card__foil";
    foil.setAttribute("aria-hidden", "true");

    const sheen = document.createElement("div");
    sheen.className = "inventory-holo-card__sheen";
    sheen.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "pickup-card__content";

    this.pickupCardArt.className = "pickup-card__art inventory-holo-card__art inventory-holo-card__art--good";
    this.pickupCardSymbol.className = "pickup-card__symbol inventory-holo-card__symbol";
    this.pickupCardArt.append(this.pickupCardSymbol);

    const text = document.createElement("div");
    text.className = "pickup-card__text";

    const eyebrow = document.createElement("p");
    eyebrow.className = "pickup-card__eyebrow";
    eyebrow.textContent = "Card Logged";

    this.pickupCardTitle.className = "pickup-card__title";
    this.pickupCardKind.className = "pickup-card__kind";
    this.pickupCardMeta.className = "pickup-card__meta";
    this.pickupCardSummary.className = "pickup-card__summary";
    text.append(eyebrow, this.pickupCardTitle, this.pickupCardKind, this.pickupCardMeta, this.pickupCardSummary);
    content.append(this.pickupCardArt, text);
    this.pickupCard.append(foil, sheen, content);
    return this.pickupCard;
  }

  private buildControlsPanel() {
    this.controlsPanel.className = "controls-panel";

    const eyebrow = document.createElement("p");
    eyebrow.className = "controls-panel__eyebrow";
    eyebrow.textContent = "Movement";

    const grid = document.createElement("div");
    grid.className = "controls-panel__grid";

    [
      ...MOVEMENT_CONTROL_LABELS,
      ["Space", "jump"],
      ["Q / Space", "Breeze Float"],
      ["Shift", "roll"],
      ["E", "interact"],
      ["Hold E", "call Karu"],
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

  private buildPouchHud() {
    this.pouchHud.className = "pouch-hud";

    const header = document.createElement("div");
    header.className = "pouch-hud__header";
    const title = document.createElement("p");
    title.className = "pouch-hud__title";
    title.textContent = "Pouch";
    const hint = document.createElement("p");
    hint.className = "pouch-hud__hint";
    hint.textContent = "gathered";
    header.append(title, hint);

    this.pouchItems.className = "pouch-hud__items";
    this.pouchDetail.className = "pouch-hud__detail";
    this.pouchDetailTitle.className = "pouch-hud__detail-title";
    this.pouchDetailBody.className = "pouch-hud__detail-body";
    this.pouchDetail.append(this.pouchDetailTitle, this.pouchDetailBody);
    this.pouchHud.append(header, this.pouchItems, this.pouchDetail);
    return this.pouchHud;
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

  private buildRollModeHud() {
    this.rollModeHud.className = "roll-mode-hud";

    const badge = document.createElement("div");
    badge.className = "roll-mode-hud__badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "Shift";

    const body = document.createElement("div");
    body.className = "roll-mode-hud__body";
    const label = document.createElement("p");
    label.className = "roll-mode-hud__label";
    label.textContent = "Roll Mode";
    this.rollModeMeter.className = "roll-mode-hud__meter";
    this.rollModeValue.className = "roll-mode-hud__value";
    this.rollModeValue.textContent = "hold";
    body.append(label, this.rollModeMeter, this.rollModeValue);
    this.rollModeHud.append(badge, body);
    return this.rollModeHud;
  }

  private updateRollModeHud(holdSeconds: number, ready: boolean, rolling: boolean, overlayOpen: boolean) {
    const progress = MathUtils.clamp(holdSeconds / ROLL_MODE_INDICATOR_DELAY, 0, 1);
    const visible = !overlayOpen && (rolling || holdSeconds > 0 || ready);
    this.rollModeHud.style.setProperty("--roll-progress", progress.toFixed(3));
    this.rollModeValue.textContent = ready ? "ready" : `${Math.ceil(Math.max(0, ROLL_MODE_INDICATOR_DELAY - holdSeconds))}s`;
    this.rollModeHud.classList.toggle("roll-mode-hud--visible", visible);
    this.rollModeHud.classList.toggle("roll-mode-hud--active", ready);
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

    const binderSpine = document.createElement("div");
    binderSpine.className = "character-screen__binder-spine";
    binderSpine.setAttribute("aria-hidden", "true");

    const aside = document.createElement("section");
    aside.className = "character-screen__aside";
    const eyebrow = document.createElement("p");
    eyebrow.className = "character-screen__eyebrow";
    eyebrow.textContent = "Resident Field Guide";
    const title = document.createElement("h2");
    title.className = "character-screen__title";
    title.textContent = "Mossu Handbook";
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

    const statsSection = this.buildCharacterSection("Profile", "Trail condition");
    statsSection.classList.add("character-section--stats");
    this.binderSections.set("profile", statsSection);
    this.statsGrid.className = "character-stat-grid";
    statsSection.append(this.statsGrid);

    const upgradesSection = this.buildCharacterSection("Moves", "Known techniques");
    upgradesSection.classList.add("character-section--abilities");
    this.upgradesGrid.className = "upgrade-grid";
    upgradesSection.append(this.upgradesGrid);

    const collectionsSection = this.buildCharacterSection(
      "Keepsake Cards",
      "Route landmarks — stamp by visiting",
      this.collectionsSectionBadge,
    );
    collectionsSection.classList.add("character-section--binder", "character-section--dex");
    this.binderSections.set("cards", collectionsSection);
    this.collectionsList.className = "collection-list";
    collectionsSection.append(this.collectionsList);

    const gatheredGoodsSection = this.buildCharacterSection(
      "Pouch Goods",
      "Forage along the path — hold E when the pouch sparkles",
      this.gatheredGoodsSectionBadge,
    );
    gatheredGoodsSection.classList.add("character-section--binder", "character-section--goods");
    this.binderSections.set("pouch", gatheredGoodsSection);
    this.gatheredGoodsList.className = "gathered-goods-list";
    gatheredGoodsSection.append(this.gatheredGoodsList);

    primaryColumn.append(statsSection, upgradesSection);
    collectionsColumn.append(collectionsSection, gatheredGoodsSection);
    content.append(this.buildBinderTabs(), primaryColumn, collectionsColumn);
    shell.append(binderSpine, aside, content);
    this.characterScreen.append(shell);
    return this.characterScreen;
  }

  private buildBinderTabs() {
    const tabs = document.createElement("div");
    tabs.className = "character-screen__tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Binder sections");

    [
      ["profile", "Profile", "trail data"],
      ["cards", "Cards", "keepsakes"],
      ["pouch", "Pouch", "forage"],
    ].forEach(([sectionId, label, descriptor]) => {
      const tab = document.createElement("button");
      const typedSectionId = sectionId as BinderSectionId;
      tab.type = "button";
      tab.className = "character-screen__tab";
      tab.textContent = label;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-label", `${label}: ${descriptor}`);
      tab.addEventListener("click", () => {
        this.setActiveBinderSection(typedSectionId, true);
      });
      this.binderTabs.set(typedSectionId, tab);
      tabs.append(tab);
    });
    this.setActiveBinderSection(this.activeBinderSection, false);

    return tabs;
  }

  private setActiveBinderSection(sectionId: BinderSectionId, scrollToSection: boolean) {
    this.activeBinderSection = sectionId;
    this.binderTabs.forEach((tab, tabSectionId) => {
      const isActive = tabSectionId === sectionId;
      tab.classList.toggle("character-screen__tab--active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    if (scrollToSection) {
      this.binderSections.get(sectionId)?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
    }
  }

  private buildPauseMenu() {
    this.pauseMenu.className = "pause-menu";

    const shell = document.createElement("div");
    shell.className = "pause-menu__shell";

    const header = document.createElement("header");
    header.className = "pause-menu__header";

    const eyebrow = document.createElement("p");
    eyebrow.className = "pause-menu__eyebrow";
    eyebrow.textContent = "Trail Break";

    const title = document.createElement("h2");
    title.className = "pause-menu__title";
    title.textContent = "Take a Breather";

    this.pauseSummary.className = "pause-menu__summary";
    header.append(eyebrow, title, this.pauseSummary);

    const actions = document.createElement("div");
    actions.className = "pause-menu__actions";
    actions.append(
      this.buildPauseAction("resume", "Esc", "Resume Trail", "Return to the meadow exactly where Mossu paused."),
      this.buildPauseAction("handbook", "Tab", "Open Handbook", "Check profile notes, keepsake cards, trail moves, and pouch goods."),
      this.buildPauseAction("map", "M", "World View", "Pull the camera above the island with no extra map panel covering the scenery."),
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

  private buildPauseAction(command: PauseCommandId, keyText: string, titleText: string, bodyText: string) {
    const article = document.createElement("button");
    article.type = "button";
    article.className = "pause-action";
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

    const figure = document.createElement("div");
    figure.className = "world-map__figure";
    figure.append(this.buildMapSvg());

    const panel = document.createElement("aside");
    panel.className = "world-map__panel";

    const badge = document.createElement("div");
    badge.className = "world-map__badge";
    badge.setAttribute("aria-hidden", "true");
    badge.innerHTML = `
      <span class="world-map__badge-sky"></span>
      <span class="world-map__badge-needle"></span>
      <span class="world-map__badge-leaf world-map__badge-leaf--left"></span>
      <span class="world-map__badge-leaf world-map__badge-leaf--right"></span>
    `;

    const header = document.createElement("header");
    header.className = "world-map__header";

    const subtitle = document.createElement("p");
    subtitle.className = "world-map__subtitle";
    subtitle.textContent = "Current Area";

    this.mapCurrentTitle.className = "world-map__title";
    header.append(this.mapCurrentTitle, subtitle);

    const topDivider = document.createElement("div");
    topDivider.className = "world-map__divider";

    const body = document.createElement("div");
    body.className = "world-map__body";

    const currentRow = document.createElement("section");
    currentRow.className = "world-map__current-row";
    const currentIcon = document.createElement("span");
    currentIcon.className = "world-map__row-icon world-map__row-icon--you";
    currentIcon.setAttribute("aria-hidden", "true");
    this.mapCurrentBody.className = "world-map__current-label";
    currentRow.append(currentIcon, this.mapCurrentBody);

    const legend = document.createElement("div");
    legend.className = "world-map__legend";
    legend.append(
      this.buildLegendRow("world-map__row-icon world-map__row-icon--poi", "Points of Interest"),
      this.buildLegendRow("world-map__row-icon world-map__row-icon--bridge", "Bridges"),
      this.buildLegendRow("world-map__row-icon world-map__row-icon--special", "Special Spots"),
    );

    this.mapNextStop.className = "world-map__route-note";
    this.mapCollectionsSummary.className = "world-map__collections";
    this.mapStamp.className = "world-map__stamp";

    const routeList = document.createElement("ol");
    routeList.className = "world-map__route-steps";
    routeLandmarks.forEach((landmark, index) => {
      const step = document.createElement("li");
      step.className = "world-map__route-step";
      step.textContent = `${index + 1}. ${landmark.title}`;
      this.mapRouteSteps.set(landmark.id, step);
      routeList.append(step);
    });

    body.append(currentRow, this.mapNextStop, routeList, this.mapCollectionsSummary, legend);

    const bottomDivider = document.createElement("div");
    bottomDivider.className = "world-map__divider";

    const filters = document.createElement("div");
    filters.className = "world-map__filters";
    filters.append(
      this.buildMapFilter("world-map__filter--poi", "T", "POI"),
      this.buildMapFilter("world-map__filter--bridge", "B", "Bridge"),
      this.buildMapFilter("world-map__filter--special", "S", "Special"),
      this.buildMapFilter("world-map__filter--you", "", "You"),
    );

    const footer = document.createElement("div");
    footer.className = "world-map__footer";
    const footerRow = document.createElement("div");
    footerRow.className = "world-map__footer-row";
    const leafLeft = document.createElement("span");
    const closeLine = document.createElement("strong");
    closeLine.textContent = "Press M or Esc to close";
    const leafRight = document.createElement("span");
    footerRow.append(leafLeft, closeLine, leafRight);
    const scrollHint = document.createElement("div");
    scrollHint.className = "world-map__footer-hint";
    scrollHint.textContent = "Scroll to zoom the island view";
    const resetHint = document.createElement("div");
    resetHint.className = "world-map__footer-hint";
    resetHint.textContent = "Drag or WASD to pan; F to focus stops; R/Home to reset";
    footer.append(this.mapStamp, footerRow, scrollHint, resetHint);

    panel.append(badge, header, topDivider, body, bottomDivider, filters, footer);
    shell.append(figure, panel);
    this.mapOverlay.append(shell);
    return this.mapOverlay;
  }

  private buildMapSvg() {
    this.mapSvg.classList.add("world-map__svg");
    this.mapSvg.setAttribute("viewBox", `0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`);
    this.mapSvg.setAttribute("role", "presentation");

    const defs = createSvgElement("defs");

    const regionSilhouettePaths: readonly { id: string; d: string }[] = [
      {
        id: "map-region-silhouette-forest",
        d: "M 22 58 C 10 36 20 12 44 10 C 62 8 85 20 90 40 C 96 58 85 80 60 86 C 36 90 20 80 22 58 Z",
      },
      {
        id: "map-region-silhouette-meadow",
        d: "M 14 48 C 14 26 34 12 52 12 C 74 12 90 30 90 50 C 90 72 70 86 50 85 C 28 84 12 70 14 48 Z",
      },
      {
        id: "map-region-silhouette-ridge",
        d: "M 10 52 Q 24 24 50 20 Q 80 16 92 40 Q 90 64 64 80 Q 34 86 8 66 Q 4 56 10 52 Z",
      },
      {
        id: "map-lake-bloom",
        d: "M 50 18 C 72 20 86 40 88 58 C 86 80 64 90 50 90 C 28 90 10 70 12 48 C 14 24 32 16 50 18 Z",
      },
    ];
    regionSilhouettePaths.forEach(({ id, d }) => {
      const sym = createSvgElement("symbol");
      sym.id = id;
      sym.setAttribute("viewBox", "0 0 100 100");
      const path = createSvgElement("path");
      path.setAttribute("d", d);
      sym.append(path);
      defs.append(sym);
    });

    const islandGradient = createSvgElement("linearGradient");
    islandGradient.id = "world-map-island-gradient";
    islandGradient.setAttribute("x1", "0%");
    islandGradient.setAttribute("y1", "100%");
    islandGradient.setAttribute("x2", "0%");
    islandGradient.setAttribute("y2", "0%");
    [
      ["0%", "#efe1a4"],
      ["28%", "#cfe392"],
      ["56%", "#93b66d"],
      ["78%", "#8a9181"],
      ["100%", "#d8dfd7"],
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
      ["0%", "#5f9fb1"],
      ["52%", "#8ec8c5"],
      ["100%", "#e7e0b4"],
    ].forEach(([offset, color]) => {
      const stop = createSvgElement("stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      riverGradient.append(stop);
    });

    const highlandRidgeGradient = createSvgElement("linearGradient");
    highlandRidgeGradient.id = "world-map-ridge-mass-gradient";
    highlandRidgeGradient.setAttribute("x1", "0%");
    highlandRidgeGradient.setAttribute("y1", "0%");
    highlandRidgeGradient.setAttribute("x2", "0%");
    highlandRidgeGradient.setAttribute("y2", "100%");
    [
      ["0%", "rgba(213, 218, 204, 0.72)"],
      ["48%", "rgba(126, 143, 126, 0.54)"],
      ["100%", "rgba(82, 104, 91, 0.42)"],
    ].forEach(([offset, color]) => {
      const stop = createSvgElement("stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      highlandRidgeGradient.append(stop);
    });

    const lakeSiltGradient = createSvgElement("radialGradient");
    lakeSiltGradient.id = "world-map-lake-gradient";
    [
      ["0%", "#9ecfe0"],
      ["55%", "#7eb8c2"],
      ["100%", "#6a9aa8"],
    ].forEach(([offset, color], i) => {
      const stop = createSvgElement("stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      stop.setAttribute("stop-opacity", i === 0 ? "0.92" : "0.88");
      lakeSiltGradient.append(stop);
    });
    lakeSiltGradient.setAttribute("gradientUnits", "objectBoundingBox");
    lakeSiltGradient.setAttribute("cx", "0.48");
    lakeSiltGradient.setAttribute("cy", "0.42");
    lakeSiltGradient.setAttribute("r", "0.58");

    const islandClip = createSvgElement("clipPath");
    islandClip.id = "world-map-island-clip";
    const clipPath = createSvgElement("path");
    clipPath.setAttribute("d", mapBoundaryPath);
    islandClip.append(clipPath);

    defs.append(islandGradient, riverGradient, highlandRidgeGradient, lakeSiltGradient, islandClip);
    this.mapSvg.append(defs);

    const islandShadow = createSvgElement("path");
    islandShadow.classList.add("world-map__island-shadow");
    islandShadow.setAttribute("d", mapBoundaryPath);
    islandShadow.setAttribute("transform", "translate(16 20)");

    const island = createSvgElement("path");
    island.classList.add("world-map__island-shape");
    island.setAttribute("d", mapBoundaryPath);

    const { center: hCenter, width: hW, height: hH, rotationDeg: hRot } = mapHighlandBackdrop;
    const highlandGroup = createSvgElement("g");
    highlandGroup.classList.add("world-map__upland-backdrop");
    highlandGroup.setAttribute("clip-path", "url(#world-map-island-clip)");
    highlandGroup.setAttribute(
      "transform",
      `translate(${hCenter.x.toFixed(1)} ${hCenter.y.toFixed(1)}) rotate(${hRot.toFixed(2)})`,
    );
    const highlandMass = createSvgElement("ellipse");
    highlandMass.setAttribute("rx", (hW / 2).toFixed(1));
    highlandMass.setAttribute("ry", (hH / 2).toFixed(1));
    highlandMass.setAttribute("fill", "url(#world-map-ridge-mass-gradient)");
    highlandGroup.append(highlandMass);

    const northRidgeD = buildMapNorthRidgePath();
    const northRidge = createSvgElement("path");
    if (northRidgeD) {
      northRidge.classList.add("world-map__north-ridge-crest");
      northRidge.setAttribute("d", northRidgeD);
      northRidge.setAttribute("clip-path", "url(#world-map-island-clip)");
    }
    const ridgeContourLayer = createSvgElement("g");
    ridgeContourLayer.classList.add("world-map__ridge-contours");
    ridgeContourLayer.setAttribute("clip-path", "url(#world-map-island-clip)");
    mapMountainRidgePaths.forEach((path, index) => {
      const contour = createSvgElement("path");
      contour.classList.add("world-map__ridge-contour", `world-map__ridge-contour--${index + 1}`);
      contour.setAttribute("d", path);
      ridgeContourLayer.append(contour);
    });

    const lakeLayer = createSvgElement("g");
    lakeLayer.classList.add("world-map__lake-layer");
    lakeLayer.setAttribute("clip-path", "url(#world-map-island-clip)");
    mapLakePatches.forEach((lake) => {
      const g = createSvgElement("g");
      g.setAttribute(
        "transform",
        `translate(${lake.center.x.toFixed(1)} ${lake.center.y.toFixed(1)}) rotate(${lake.rotationDeg.toFixed(2)})`,
      );
      g.classList.add("world-map__lake", `world-map__lake--${lake.id.replace(/[^a-z0-9-]/g, "-")}`);
      const blo = createSvgElement("use");
      blo.setAttribute("href", "#map-lake-bloom");
      blo.classList.add("world-map__lake-bloom");
      const rx = (lake.width / 2).toFixed(1);
      const ry = (lake.height / 2).toFixed(1);
      blo.setAttribute("x", `-${rx}`);
      blo.setAttribute("y", `-${ry}`);
      blo.setAttribute("width", lake.width.toFixed(1));
      blo.setAttribute("height", lake.height.toFixed(1));
      g.append(blo);
      lakeLayer.append(g);
    });

    const regionLayer = createSvgElement("g");
    regionLayer.classList.add("world-map__region-layer");
    regionLayer.setAttribute("clip-path", "url(#world-map-island-clip)");
    mapRegionPatches.forEach((region) => {
      const patchGroup = createSvgElement("g");
      patchGroup.classList.add("world-map__region-patch", `world-map__region-patch--${region.kind}`);
      patchGroup.setAttribute(
        "transform",
        `translate(${region.center.x.toFixed(1)} ${region.center.y.toFixed(1)}) rotate(${region.rotationDeg.toFixed(2)})`,
      );
      const usePatch = createSvgElement("use");
      usePatch.setAttribute("href", `#map-region-silhouette-${region.kind}`);
      const w = region.width;
      const h = region.height;
      usePatch.setAttribute("x", (-w / 2).toFixed(1));
      usePatch.setAttribute("y", (-h / 2).toFixed(1));
      usePatch.setAttribute("width", w.toFixed(1));
      usePatch.setAttribute("height", h.toFixed(1));
      patchGroup.append(usePatch);
      regionLayer.append(patchGroup);
    });

    const forestGlyphLayer = createSvgElement("g");
    forestGlyphLayer.classList.add("world-map__forest-glyph-layer");
    forestGlyphLayer.setAttribute("clip-path", "url(#world-map-island-clip)");
    mapForestGlyphs.forEach((glyph) => {
      forestGlyphLayer.append(this.createMapForestGlyph(glyph.kind, glyph.title, glyph.point.x, glyph.point.y));
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
    mapAtlasMarkers.forEach((marker) => {
      landmarkLayer.append(this.createMapAtlasMarker(marker.kind, marker.title, marker.point.x, marker.point.y));
    });
    worldLandmarks.forEach((landmark) => {
      const marker = this.createMapLandmarkMarker(landmark);
      landmarkLayer.append(marker.group);
      this.mapLandmarkMarkers.set(landmark.id, marker);
    });
    landmarkLayer.append(this.mapPlayerMarker.group);

    this.mapSvg.append(
      islandShadow,
      island,
      highlandGroup,
      ...(northRidgeD ? [northRidge] : []),
      ridgeContourLayer,
      lakeLayer,
      regionLayer,
      forestGlyphLayer,
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
    swatch.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "world-map__legend-label";
    label.textContent = labelText;
    row.append(swatch, label);
    return row;
  }

  private buildMapFilter(className: string, symbolText: string, labelText: string) {
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
    const isRoute = routeLandmarkIdSet.has(landmark.id);

    const group = createSvgElement("g");
    group.classList.add("world-map__marker");
    group.setAttribute("transform", `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
    if (landmark.id === "peak-shrine") {
      group.classList.add("world-map__marker--shrine");
    }
    if (!isRoute) {
      group.classList.add("world-map__marker--minor");
    }

    const ring = createSvgElement("circle");
    if (isRoute) {
      ring.setAttribute("r", landmark.id === "peak-shrine" ? "13" : "10");
    } else {
      ring.setAttribute("r", "6.5");
    }

    const dot = createSvgElement("circle");
    if (isRoute) {
      dot.setAttribute("r", landmark.id === "peak-shrine" ? "5.8" : "4.6");
    } else {
      dot.setAttribute("r", "3.2");
    }

    const label = createSvgElement("text");
    label.classList.add("world-map__marker-label");
    label.setAttribute("x", `${layout.dx}`);
    label.setAttribute("y", `${layout.dy}`);
    label.setAttribute("text-anchor", layout.anchor);
    if (isRoute) {
      label.textContent = landmark.title;
    } else {
      label.textContent = "";
      label.setAttribute("aria-hidden", "true");
    }
    group.setAttribute("aria-label", landmark.title);

    group.append(ring, dot, label);

    return { group, ring, dot, label };
  }

  private createMapAtlasMarker(kind: "bridge" | "poi" | "special", title: string, x: number, y: number) {
    const group = createSvgElement("g");
    group.classList.add("world-map__atlas-marker", `world-map__atlas-marker--${kind}`);
    group.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    group.setAttribute("aria-label", title);

    const backing = createSvgElement("circle");
    backing.setAttribute("r", kind === "bridge" ? "15" : "14");

    const icon = createSvgElement("path");
    if (kind === "bridge") {
      icon.setAttribute("d", "M -8 3 Q 0 -7 8 3 M -9 7 L 9 7 M -5 5 L -5 0 M 0 5 L 0 -3 M 5 5 L 5 0");
    } else if (kind === "special") {
      icon.setAttribute("d", "M 0 -10 L 3 -3 L 10 -3 L 4 2 L 6 10 L 0 5 L -6 10 L -4 2 L -10 -3 L -3 -3 Z");
    } else {
      icon.setAttribute("d", "M -2 8 L 2 8 L 2 2 Q 9 0 7 -7 Q 2 -5 0 -10 Q -2 -5 -7 -7 Q -9 0 -2 2 Z");
    }
    group.append(backing, icon);
    return group;
  }

  private createMapForestGlyph(kind: "deep" | "grove" | "ancient" | "fruit", title: string, x: number, y: number) {
    const group = createSvgElement("g");
    group.classList.add("world-map__forest-glyph", `world-map__forest-glyph--${kind}`);
    group.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    group.setAttribute("aria-label", title);

    const crown = createSvgElement("path");
    if (kind === "ancient") {
      crown.setAttribute("d", "M -8 8 L -8 -6 Q -3 -12 0 -4 Q 3 -12 8 -6 L 8 8 M -11 8 L 11 8 M -6 3 Q 0 -2 6 3");
    } else if (kind === "fruit") {
      crown.setAttribute("d", "M 0 -10 C 8 -10 13 -5 12 2 C 11 9 5 12 0 9 C -5 12 -11 9 -12 2 C -13 -5 -8 -10 0 -10 Z M -3 1 A 1.4 1.4 0 1 0 -3.1 1");
    } else if (kind === "grove") {
      crown.setAttribute("d", "M -11 5 C -13 -4 -6 -10 0 -8 C 6 -10 13 -4 11 5 C 8 11 -8 11 -11 5 Z M 0 9 L 0 2");
    } else {
      crown.setAttribute("d", "M -10 8 L -5 0 L -8 0 L -3 -7 L -5 -7 L 0 -13 L 5 -7 L 3 -7 L 8 0 L 5 0 L 10 8 Z M 0 8 L 0 0");
    }
    group.append(crown);
    return group;
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

    this.mapCurrentTitle.textContent = "Mossu Isles";
    this.mapCurrentBody.textContent = frame.currentLandmark;
    const completedRouteCount = routeLandmarks.filter((landmark) => frame.save.catalogedLandmarkIds.has(landmark.id)).length;
    const isSkywardStop = currentRouteLandmark?.id === "skyward-ledge" || nextRouteLandmark?.id === "skyward-ledge";
    const routeCopy = isSkywardStop
      ? "pause on the ledge for one long overlook before the final traverse."
      : "follow the river north and stay on the marked route.";
    this.mapNextStop.textContent = currentRouteLandmark && !frame.save.catalogedLandmarkIds.has(currentRouteLandmark.id)
      ? `Current stop: ${currentRouteLandmark.title}. Route progress ${completedRouteCount}/${routeLandmarks.length}. Drift through it to stamp the climb, then ${routeCopy}`
      : nextRouteLandmark
        ? `Next stop: ${nextRouteLandmark.title}. Route progress ${completedRouteCount}/${routeLandmarks.length}. ${routeCopy.charAt(0).toUpperCase() + routeCopy.slice(1)}`
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

  private formatForageableKind(kind: string) {
    return kind
      .replace("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private formatForageableSymbol(kind: ForageableKind) {
    const symbols: Record<ForageableKind, string> = {
      seed: "Seed",
      shell: "Shell",
      moss_tuft: "Moss",
      berry: "Berry",
      smooth_stone: "Stone",
      feather: "Feather",
    };
    return symbols[kind];
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

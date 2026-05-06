export const VISUAL_QUALITY_PRESETS = ["soft", "anime", "crisp", "nordic"] as const;
export type VisualQualityPreset = (typeof VISUAL_QUALITY_PRESETS)[number];

export type QualitySettingKey =
  | "visualPreset"
  | "pixelRatioCap"
  | "bloomEnabled"
  | "bloomIntensity"
  | "fogStrength"
  | "cameraDistance";

export interface QualitySettings {
  visualPreset: VisualQualityPreset;
  pixelRatioCap: number;
  bloomEnabled: boolean;
  bloomIntensity: number;
  fogStrength: number;
  cameraDistance: number;
}

type StoredQualitySettingsPayload = {
  version: 1;
  settings: Partial<QualitySettings>;
};

export const QUALITY_SETTINGS_STORAGE_KEY = "mossu.quality.v1";
export const QUALITY_SETTINGS_VERSION = 1;

export const QUALITY_SETTING_LIMITS = {
  pixelRatioCap: { min: 0.55, max: 1.1, step: 0.01 },
  bloomIntensity: { min: 0, max: 1.25, step: 0.05 },
  fogStrength: { min: 0.7, max: 1.25, step: 0.05 },
  cameraDistance: { min: -8, max: 10, step: 1 },
} as const;

export const QUALITY_PRESETS: Record<VisualQualityPreset, QualitySettings> = {
  soft: {
    visualPreset: "soft",
    pixelRatioCap: 0.82,
    bloomEnabled: true,
    bloomIntensity: 1.15,
    fogStrength: 1.12,
    cameraDistance: 3,
  },
  anime: {
    visualPreset: "anime",
    pixelRatioCap: 1,
    bloomEnabled: true,
    bloomIntensity: 1,
    fogStrength: 1,
    cameraDistance: 0,
  },
  crisp: {
    visualPreset: "crisp",
    pixelRatioCap: 1.1,
    bloomEnabled: false,
    bloomIntensity: 0.45,
    fogStrength: 0.82,
    cameraDistance: -2,
  },
  nordic: {
    visualPreset: "nordic",
    pixelRatioCap: 0.98,
    bloomEnabled: true,
    bloomIntensity: 0.72,
    fogStrength: 1.02,
    cameraDistance: 0,
  },
};

export const DEFAULT_QUALITY_SETTINGS: QualitySettings = { ...QUALITY_PRESETS.nordic };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numberOrDefault(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

function isVisualQualityPreset(value: unknown): value is VisualQualityPreset {
  return typeof value === "string" && (VISUAL_QUALITY_PRESETS as readonly string[]).includes(value);
}

function visualPresetOrDefault(value: unknown, fallback: VisualQualityPreset): VisualQualityPreset {
  return isVisualQualityPreset(value) ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeQualitySettings(input: Partial<QualitySettings> = {}): QualitySettings {
  const preset = visualPresetOrDefault(input.visualPreset, DEFAULT_QUALITY_SETTINGS.visualPreset);
  const base = QUALITY_PRESETS[preset];

  return {
    visualPreset: preset,
    pixelRatioCap: numberOrDefault(
      input.pixelRatioCap,
      base.pixelRatioCap,
      QUALITY_SETTING_LIMITS.pixelRatioCap.min,
      QUALITY_SETTING_LIMITS.pixelRatioCap.max,
    ),
    bloomEnabled: booleanOrDefault(input.bloomEnabled, base.bloomEnabled),
    bloomIntensity: numberOrDefault(
      input.bloomIntensity,
      base.bloomIntensity,
      QUALITY_SETTING_LIMITS.bloomIntensity.min,
      QUALITY_SETTING_LIMITS.bloomIntensity.max,
    ),
    fogStrength: numberOrDefault(
      input.fogStrength,
      base.fogStrength,
      QUALITY_SETTING_LIMITS.fogStrength.min,
      QUALITY_SETTING_LIMITS.fogStrength.max,
    ),
    cameraDistance: numberOrDefault(
      input.cameraDistance,
      base.cameraDistance,
      QUALITY_SETTING_LIMITS.cameraDistance.min,
      QUALITY_SETTING_LIMITS.cameraDistance.max,
    ),
  };
}

export function shouldPersistQualitySettings(params: URLSearchParams) {
  return (
    !params.has("qaDebug") &&
    !params.has("e2e") &&
    !params.has("perfDebug") &&
    !params.has("perfHud") &&
    !params.has("deterministicPerf") &&
    !params.has("coopStress")
  );
}

export function readQualitySettings(params: URLSearchParams): QualitySettings {
  const requestedPreset = visualPresetOrDefault(params.get("visualPreset"), DEFAULT_QUALITY_SETTINGS.visualPreset);
  const requestedPixelRatio = params.get("pixelRatio");
  const querySettings = normalizeQualitySettings({
    ...QUALITY_PRESETS[requestedPreset],
    pixelRatioCap: requestedPixelRatio === null ? undefined : Number(requestedPixelRatio),
  });

  if (!shouldPersistQualitySettings(params) || typeof window === "undefined") {
    return querySettings;
  }

  try {
    const raw = window.localStorage.getItem(QUALITY_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return querySettings;
    }
    const payload = JSON.parse(raw) as Partial<StoredQualitySettingsPayload>;
    if (payload.version !== QUALITY_SETTINGS_VERSION || !payload.settings) {
      return querySettings;
    }
    return normalizeQualitySettings(payload.settings);
  } catch (error) {
    console.warn("Mossu quality settings restore failed", error);
    return querySettings;
  }
}

export function writeQualitySettings(settings: QualitySettings) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const payload: StoredQualitySettingsPayload = {
      version: QUALITY_SETTINGS_VERSION,
      settings: normalizeQualitySettings(settings),
    };
    window.localStorage.setItem(QUALITY_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn("Mossu quality settings persist failed", error);
    return false;
  }
}

export function getQualityToneMappingExposure(preset: VisualQualityPreset) {
  switch (preset) {
    case "soft":
      return 1.08;
    case "anime":
      return 1.06;
    case "crisp":
      return 1.02;
    case "nordic":
      return 1.14;
  }
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCameraDistance(value: number) {
  if (value === 0) {
    return "normal";
  }
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

export function getQualitySettingOutput(settings: QualitySettings, key: QualitySettingKey) {
  switch (key) {
    case "visualPreset":
      return settings.visualPreset;
    case "pixelRatioCap":
      return formatPercent(settings.pixelRatioCap);
    case "bloomEnabled":
      return settings.bloomEnabled ? "on" : "off";
    case "bloomIntensity":
      return formatPercent(settings.bloomIntensity);
    case "fogStrength":
      return formatPercent(settings.fogStrength);
    case "cameraDistance":
      return formatCameraDistance(settings.cameraDistance);
  }
}

export function readQualitySettingsPatchFromControl(control: HTMLInputElement) {
  const key = control.dataset.qualitySetting as QualitySettingKey | undefined;
  if (!key) {
    return null;
  }

  switch (key) {
    case "visualPreset":
      if (!control.checked) {
        return null;
      }
      return { ...QUALITY_PRESETS[visualPresetOrDefault(control.value, DEFAULT_QUALITY_SETTINGS.visualPreset)] };
    case "bloomEnabled":
      return { bloomEnabled: control.checked };
    case "pixelRatioCap":
    case "bloomIntensity":
    case "fogStrength":
    case "cameraDistance":
      return { [key]: Number(control.value) } as Partial<QualitySettings>;
  }
}

function rangeControl(
  setting: Extract<QualitySettingKey, "pixelRatioCap" | "bloomIntensity" | "fogStrength" | "cameraDistance">,
  label: string,
  body: string,
) {
  const limits = QUALITY_SETTING_LIMITS[setting];
  return `
    <label class="quality-control quality-control--range">
      <span class="quality-control__copy">
        <span class="quality-control__label">${label}</span>
        <small>${body}</small>
      </span>
      <span class="quality-control__range-wrap">
        <input
          class="quality-control__range"
          type="range"
          min="${limits.min}"
          max="${limits.max}"
          step="${limits.step}"
          data-quality-setting="${setting}"
        />
        <output class="quality-control__value" data-quality-output="${setting}"></output>
      </span>
    </label>
  `;
}

export function createQualitySettingsMarkup(surface: "title" | "pause") {
  const presetName = `quality-preset-${surface}`;
  return `
    <div class="quality-settings quality-settings--${surface}" data-quality-settings-surface="${surface}">
      <div class="quality-settings__presets" role="radiogroup" aria-label="Visual preset">
        ${VISUAL_QUALITY_PRESETS.map(
          (preset) => `
              <label class="quality-preset quality-preset--${preset}">
                <input type="radio" name="${presetName}" value="${preset}" data-quality-setting="visualPreset" />
                <span>${preset}</span>
              </label>
            `,
        ).join("")}
      </div>
      <div class="quality-settings__grid">
        ${rangeControl("pixelRatioCap", "Pixel ratio", "Render scale cap")}
        <label class="quality-control quality-control--toggle">
          <span class="quality-control__copy">
            <span class="quality-control__label">Bloom</span>
            <small>Scene glow pass</small>
          </span>
          <span class="quality-control__switch">
            <input type="checkbox" data-quality-setting="bloomEnabled" />
            <span aria-hidden="true"></span>
          </span>
        </label>
        ${rangeControl("bloomIntensity", "Glow", "Bloom strength")}
        ${rangeControl("fogStrength", "Fog", "Distance haze")}
        ${rangeControl("cameraDistance", "Camera", "Closer / farther")}
      </div>
    </div>
  `;
}

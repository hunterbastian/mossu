const UI_CLICK_VARIANTS = [
  { url: "/audio/menu-ui-click.mp3", volume: 0.18 },
  { url: "/audio/destiny-ui-click.mp3", volume: 0.16 },
] as const;
const CLICK_POOL_SIZE_PER_VARIANT = 3;

interface ClickAudioSlot {
  audio: HTMLAudioElement;
  volume: number;
}

export class InterfaceAudio {
  private readonly clickPools: ClickAudioSlot[][] = [];
  private readonly clickIndices: number[] = [];
  private clickVariantIndex = 0;

  constructor() {
    if (typeof Audio === "undefined") {
      return;
    }

    UI_CLICK_VARIANTS.forEach((variant, variantIndex) => {
      const pool: ClickAudioSlot[] = [];
      for (let index = 0; index < CLICK_POOL_SIZE_PER_VARIANT; index += 1) {
        const click = new Audio(variant.url);
        click.preload = "auto";
        click.volume = variant.volume;
        pool.push({ audio: click, volume: variant.volume });
      }
      this.clickPools.push(pool);
      this.clickIndices[variantIndex] = 0;
    });
  }

  playClick() {
    if (this.clickPools.length === 0) {
      return;
    }

    const variantIndex = this.clickVariantIndex;
    const pool = this.clickPools[variantIndex];
    const poolIndex = this.clickIndices[variantIndex] ?? 0;
    const slot = pool[poolIndex];
    if (!slot) {
      return;
    }

    this.clickVariantIndex = (this.clickVariantIndex + 1) % this.clickPools.length;
    this.clickIndices[variantIndex] = (poolIndex + 1) % pool.length;
    const { audio: click, volume } = slot;
    click.pause();
    click.currentTime = 0;
    click.volume = volume;
    void click.play().catch(() => {
      // Browser audio policies can reject playback outside a direct gesture.
    });
  }

  dispose() {
    this.clickPools.forEach((pool) => {
      pool.forEach(({ audio }) => {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      });
    });
    this.clickPools.length = 0;
  }
}

export function isButtonLikeUiTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  const button = target.closest<HTMLElement>(
    "button, [role='button'], a.title-screen__tool-step, a.model-viewer__back-link",
  );
  if (!button) {
    return false;
  }

  const ariaDisabled = button.getAttribute("aria-disabled") === "true";
  const htmlDisabled = button instanceof HTMLButtonElement && button.disabled;
  return !ariaDisabled && !htmlDisabled;
}

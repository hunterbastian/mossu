import { MOSSU_SUPPORT_URL } from "./buildMeta";

export type MossuErrorDetail = {
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  error?: Error;
  reason?: unknown;
};

const OVERLAY_CLASS = "mossu-error-overlay";

/** Public hook + event for future Sentry/analytics; dependency-free. */
export function reportMossuError(details: MossuErrorDetail): void {
  try {
    window.dispatchEvent(new CustomEvent("mossu:error", { detail: details }));
    window.mossuReportError?.(details);
  } catch {
    // Never throw from reporting.
  }
}

export function showMossuErrorOverlay(
  host: HTMLElement,
  options: {
    headline: string;
    body?: string;
    mode: "bootstrap" | "runtime";
    onRetry?: () => void;
    technical?: string;
  },
): void {
  host.querySelector(`.${OVERLAY_CLASS}`)?.remove();

  const root = document.createElement("div");
  root.className = OVERLAY_CLASS;
  root.setAttribute("role", "alert");

  const panel = document.createElement("div");
  panel.className = "mossu-error-overlay__panel";

  const title = document.createElement("h1");
  title.className = "mossu-error-overlay__title";
  title.textContent = options.headline;

  const copy = document.createElement("p");
  copy.className = "mossu-error-overlay__body";
  copy.textContent =
    options.body ??
    (options.mode === "bootstrap"
      ? "Something stopped Mossu from starting. You can try again or check support for updates."
      : "Something went wrong. Reloading usually clears it—your progress may depend on autosave.");

  panel.append(title, copy);

  if (options.technical) {
    const pre = document.createElement("pre");
    pre.className = "mossu-error-overlay__technical";
    pre.textContent = options.technical;
    panel.append(pre);
  }

  const actions = document.createElement("div");
  actions.className = "mossu-error-overlay__actions";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "mossu-error-overlay__btn mossu-error-overlay__btn--primary";
  retry.textContent = "Retry";

  const support = document.createElement("a");
  support.className = "mossu-error-overlay__btn mossu-error-overlay__btn--ghost";
  support.href = MOSSU_SUPPORT_URL;
  support.target = "_blank";
  support.rel = "noopener noreferrer";
  support.textContent = "Support";

  retry.addEventListener("click", () => {
    root.remove();
    if (options.mode === "bootstrap" && options.onRetry) {
      options.onRetry();
    } else {
      window.location.reload();
    }
  });

  actions.append(retry, support);
  panel.append(actions);
  root.append(panel);
  host.append(root);
}

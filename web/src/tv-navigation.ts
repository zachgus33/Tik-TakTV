const selector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function visible(element: HTMLElement) {
  const style = getComputedStyle(element);
  return (
    element.offsetWidth > 0 &&
    element.offsetHeight > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function activeModal() {
  const modals = [
    ...document.querySelectorAll<HTMLElement>(
      "dialog[open], [role='dialog'][aria-modal='true']",
    ),
  ].filter(visible);
  return modals.at(-1) ?? null;
}

function candidates(scope: ParentNode = activeModal() ?? document) {
  return [...scope.querySelectorAll<HTMLElement>(selector)].filter(visible);
}

const navigationGroupSelector = [
  ".sidebar",
  ".topbar",
  ".hero",
  ".quick-strip",
  ".media-row",
  ".filter-toolbar",
  ".recent-channels",
  ".tv-guide-heading",
  ".tv-guide-row",
  ".settings-card",
  ".setup-paths",
  ".setup-checks",
  "footer",
].join(",");

function directionalCandidates(
  active: HTMLElement,
  direction: "left" | "right" | "up" | "down",
  scope: HTMLElement | Document,
) {
  if (scope !== document) return candidates(scope);
  const group = active.closest<HTMLElement>(navigationGroupSelector);
  if (!group) return candidates(document);
  if (direction === "left" || direction === "right") {
    const local = candidates(group);
    // Moving right from the navigation rail must still be able to enter the
    // page. That is the only horizontal move that needs the whole document.
    if (group.matches(".sidebar") && direction === "right")
      return candidates(document);
    return local;
  }
  const groups = [
    ...document.querySelectorAll<HTMLElement>(navigationGroupSelector),
  ].filter(
    (entry) =>
      entry === group || !entry.parentElement?.closest(navigationGroupSelector),
  );
  const index = groups.indexOf(group);
  const step = direction === "down" ? 1 : -1;
  const nearby = [group, groups[index + step], groups[index + step * 2]].filter(
    (entry): entry is HTMLElement => !!entry,
  );
  const result = nearby.flatMap((entry) => candidates(entry));
  return result.length ? [...new Set(result)] : candidates(document);
}

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function overlapsOnCrossAxis(
  origin: DOMRect,
  target: DOMRect,
  horizontal: boolean,
) {
  return horizontal
    ? Math.min(origin.bottom, target.bottom) > Math.max(origin.top, target.top)
    : Math.min(origin.right, target.right) > Math.max(origin.left, target.left);
}

function scrollModalBody(
  modal: HTMLElement,
  direction: "left" | "right" | "up" | "down",
) {
  if (direction !== "up" && direction !== "down") return false;
  const body = modal.querySelector<HTMLElement>(".setup-wizard-body");
  if (!body || body.scrollHeight <= body.clientHeight) return false;
  const maxScroll = body.scrollHeight - body.clientHeight;
  if (
    (direction === "up" && body.scrollTop <= 2) ||
    (direction === "down" && body.scrollTop >= maxScroll - 2)
  )
    return false;
  body.scrollBy({
    top:
      (direction === "down" ? 1 : -1) *
      Math.max(140, Math.round(body.clientHeight * 0.55)),
    behavior: "auto",
  });
  return true;
}

function scrollPage(direction: "left" | "right" | "up" | "down") {
  if (direction !== "up" && direction !== "down") return false;
  const root = document.scrollingElement;
  if (!root || root.scrollHeight <= window.innerHeight) return false;
  window.scrollBy({
    top:
      (direction === "down" ? 1 : -1) *
      Math.max(260, Math.round(window.innerHeight * 0.72)),
    behavior: "auto",
  });
  return true;
}

function move(direction: "left" | "right" | "up" | "down") {
  const modal = activeModal();
  const scope = modal ?? document;
  const active = document.activeElement as HTMLElement | null;
  const items =
    active && active !== document.body
      ? directionalCandidates(active, direction, scope)
      : candidates(scope);
  if (!items.length) return false;
  if (!active || !items.includes(active)) {
    items[0].focus({ preventScroll: false });
    return true;
  }
  if (
    modal &&
    active.classList.contains("setup-wizard-body") &&
    scrollModalBody(modal, direction)
  )
    return true;
  if (
    modal &&
    direction === "down" &&
    active.classList.contains("setup-wizard-body")
  ) {
    const footerControl = candidates(modal.querySelector("footer") ?? modal)[0];
    if (footerControl) {
      footerControl.focus({ preventScroll: false });
      return true;
    }
  }
  const originRect = active.getBoundingClientRect();
  const origin = center(originRect);
  const horizontal = direction === "left" || direction === "right";
  const positive = direction === "right" || direction === "down";
  const next = items
    .filter((item) => item !== active)
    .map((item) => {
      const targetRect = item.getBoundingClientRect();
      const target = center(targetRect);
      const primary = horizontal ? target.x - origin.x : target.y - origin.y;
      const secondary = horizontal
        ? Math.abs(target.y - origin.y)
        : Math.abs(target.x - origin.x);
      const aligned = overlapsOnCrossAxis(originRect, targetRect, horizontal);
      return {
        item,
        primary,
        score:
          Math.abs(primary) +
          secondary * (aligned ? 0.35 : 2.5) +
          (aligned ? 0 : 180),
      };
    })
    .filter(({ primary }) => (positive ? primary > 4 : primary < -4))
    .sort((left, right) => left.score - right.score)[0]?.item;
  // Keep arrows inside a modal at its edges so WebView cannot scroll the page
  // behind the modal.
  if (!next) {
    if (modal) scrollModalBody(modal, direction);
    return modal ? true : scrollPage(direction);
  }
  next.focus({ preventScroll: false });
  next.scrollIntoView({
    block: "nearest",
    inline: "center",
    behavior: "auto",
  });
  return true;
}

export function enableTvNavigation() {
  const params = new URLSearchParams(location.search);
  const enabled =
    params.get("tv") === "1" || /TikTakTV-AndroidTV/i.test(navigator.userAgent);
  if (!enabled) return;
  document.documentElement.classList.add("tv-mode");
  // The Android shell also has a legacy focus helper. Mark navigation as
  // installed before page-finished fires so only this spatial navigator moves
  // the viewport.
  (
    window as Window & { __tiktakTvFocusInstalled?: boolean }
  ).__tiktakTvFocusInstalled = true;
  let previousModal: HTMLElement | null = null;
  const focusModal = () => {
    const modal = activeModal();
    if (!modal || modal === previousModal) return;
    previousModal = modal;
    const target =
      modal.querySelector<HTMLElement>(
        "[data-tv-initial-focus]:not([disabled])",
      ) ?? candidates(modal)[0];
    target?.focus({ preventScroll: false });
  };
  const observer = new MutationObserver(() => {
    if (!activeModal()) previousModal = null;
    requestAnimationFrame(focusModal);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open", "aria-modal"],
  });
  document.addEventListener("keydown", (event) => {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    )
      return;
    const direction = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    }[event.key] as "left" | "right" | "up" | "down" | undefined;
    if (direction && move(direction)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  window.addEventListener(
    "load",
    () => {
      if (
        !(document.activeElement instanceof HTMLElement) ||
        document.activeElement === document.body
      )
        candidates()[0]?.focus({ preventScroll: false });
      focusModal();
    },
    { once: true },
  );
}

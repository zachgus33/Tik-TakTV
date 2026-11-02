const selector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function visible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function candidates() {
  return [...document.querySelectorAll<HTMLElement>(selector)].filter(visible);
}

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function move(direction: "left" | "right" | "up" | "down") {
  const items = candidates();
  if (!items.length) return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active || !items.includes(active)) {
    items[0].focus({ preventScroll: false });
    return true;
  }
  const origin = center(active.getBoundingClientRect());
  const horizontal = direction === "left" || direction === "right";
  const positive = direction === "right" || direction === "down";
  const next = items
    .filter((item) => item !== active)
    .map((item) => {
      const target = center(item.getBoundingClientRect());
      const primary = horizontal ? target.x - origin.x : target.y - origin.y;
      const secondary = horizontal
        ? Math.abs(target.y - origin.y)
        : Math.abs(target.x - origin.x);
      return { item, primary, score: Math.abs(primary) + secondary * 2.5 };
    })
    .filter(({ primary }) => (positive ? primary > 4 : primary < -4))
    .sort((left, right) => left.score - right.score)[0]?.item;
  if (!next) return false;
  next.focus({ preventScroll: false });
  next.scrollIntoView({
    block: "nearest",
    inline: "center",
    behavior: "smooth",
  });
  return true;
}

export function enableTvNavigation() {
  const params = new URLSearchParams(location.search);
  const enabled =
    params.get("tv") === "1" || /TikTakTV-AndroidTV/i.test(navigator.userAgent);
  if (!enabled) return;
  document.documentElement.classList.add("tv-mode");
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
    },
    { once: true },
  );
}

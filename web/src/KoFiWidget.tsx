import { useEffect } from "react";

const scriptId = "kofi-overlay-widget-script";
let widgetDrawn = false;

declare global {
  interface Window {
    kofiWidgetOverlay?: {
      draw: (pageId: string, config: Record<string, string>) => void;
    };
  }
}

export function KoFiWidget() {
  useEffect(() => {
    if (
      document.documentElement.classList.contains("tv-mode") ||
      new URLSearchParams(location.search).get("tv") === "1" ||
      /TikTakTV-AndroidTV/i.test(navigator.userAgent)
    )
      return;

    document.body.classList.add("show-kofi-widget");

    const drawWidget = () => {
      if (widgetDrawn || !window.kofiWidgetOverlay) return;
      window.kofiWidgetOverlay.draw("tiktaktv", {
        type: "floating-chat",
        "floating-chat.donateButton.text": "Support me",
        "floating-chat.donateButton.background-color": "#00b9fe",
        "floating-chat.donateButton.text-color": "#fff",
      });
      widgetDrawn = true;
    };

    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (script) {
      script.addEventListener("load", drawWidget);
      drawWidget();
    } else {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://storage.ko-fi.com/cdn/scripts/overlay-widget.js";
      script.async = true;
      script.addEventListener("load", drawWidget);
      document.body.appendChild(script);
    }

    return () => {
      script?.removeEventListener("load", drawWidget);
      document.body.classList.remove("show-kofi-widget");
    };
  }, []);

  return null;
}

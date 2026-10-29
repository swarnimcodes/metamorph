import type { AnchorHTMLAttributes } from "react";
import { isTauri } from "../lib/platform";
import { toastError } from "../lib/toast";

/**
 * A link that leaves the app. In a browser it is a normal new-tab link; inside the Tauri
 * WebView a new-tab link goes nowhere, so the click is handed to the system (the maps app or browser).
 */
export function ExternalLink({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !isTauri()) return;
        e.preventDefault();
        import("@tauri-apps/plugin-opener")
          .then((m) => m.openUrl(href))
          .catch(() => toastError("Couldn't open the link"));
      }}
    />
  );
}

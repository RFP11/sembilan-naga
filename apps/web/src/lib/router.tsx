import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

// A few top-level pages don't need a routing library: the path, a way to change it, and a link.

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function usePath() {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function navigate(to: string) {
  window.history.pushState(null, "", to);
  window.scrollTo(0, 0);
  listeners.forEach((listener) => listener());
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // Leave new-tab clicks and in-page anchors to the browser.
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (!href || href.startsWith("#")) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}

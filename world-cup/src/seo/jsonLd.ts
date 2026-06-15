import { useEffect } from "react";

/**
 * Injects a page-scoped <script type="application/ld+json"> into <head> for the
 * lifetime of the component, removing it on unmount/route change. Crawlers that
 * execute JS (e.g. Googlebot) pick up the structured data; the site-wide schema
 * baked into index.html covers non-JS crawlers.
 */
export function useJsonLd(data: object | object[] | null | undefined) {
  const json = data ? JSON.stringify(data) : null;
  useEffect(() => {
    if (!json) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.dataset.jsonld = "page";
    el.textContent = json;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [json]);
}

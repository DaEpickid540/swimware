/**
 * Embeds an external site in a large centered iframe, with a robust fallback:
 * many sites (SwimCloud, masonswimming.org, etc.) send X-Frame-Options / CSP
 * headers that BLOCK embedding, in which case the iframe renders blank. We
 * always show a prominent "open in a new tab" link so the feature works
 * regardless, and surface a short notice if the frame looks blocked.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ExternalEmbed({
  url,
  title,
  children,
}: {
  url: string;
  title: string;
  children?: ReactNode; // extra instructions rendered under the frame
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [maybeBlocked, setMaybeBlocked] = useState(false);

  useEffect(() => {
    // If the iframe never fires `load` shortly, it's likely blocked by headers.
    const t = setTimeout(() => setMaybeBlocked(true), 4000);
    const el = ref.current;
    const onLoad = () => {
      clearTimeout(t);
      setMaybeBlocked(false);
    };
    el?.addEventListener("load", onLoad);
    return () => {
      clearTimeout(t);
      el?.removeEventListener("load", onLoad);
    };
  }, [url]);

  return (
    <div className="embed">
      <div className="embed__bar">
        <span className="embed__url">{new URL(url).hostname}</span>
        <a className="btn btn--sm btn--primary" href={url} target="_blank" rel="noreferrer">
          Open in new tab ↗
        </a>
      </div>

      <div className="embed__frame-wrap">
        <iframe
          ref={ref}
          className="embed__frame"
          src={url}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>

      {maybeBlocked && (
        <p className="embed__notice" role="note">
          If the page above is blank, {new URL(url).hostname} blocks embedding for
          security. Use the <strong>Open in new tab ↗</strong> button — it works the
          same.
        </p>
      )}

      {children}
    </div>
  );
}

// One recovery boundary for obsolete public documents, including route metadata in <Meta>.
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { createRenderErrorHandler } from "./lib/render-recovery";

// Capture once before hydration; this belongs to the document, not later navigation responses.
const documentRelease = document.querySelector('meta[name="aihot-release"]')?.getAttribute("content") ?? null;
const onError = createRenderErrorHandler(documentRelease);

// A proxied image can fail before hydration attaches any handler (the server's markup starts loading
// immediately). Listening in the capture phase covers those too: the browser's broken-image glyph is
// hidden, leaving the surface underneath. Picture's own onError covers later failures.
window.addEventListener("error", (event) => {
  const target = event.target;
  if (target instanceof HTMLImageElement) target.style.visibility = "hidden";
}, true);

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    { onCaughtError: onError },
  );
});

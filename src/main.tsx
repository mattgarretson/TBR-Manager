import "@fontsource-variable/dm-sans";
import "@fontsource-variable/fraunces";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createDemoDependencies, isDemoLaunch } from "../app/demo-mode";
import { setViewPreferencesEphemeral } from "../components/library/view-preferences";
import "../app/globals.css";
import { PlotPileApp } from "../app/plot-pile-app";
import type { LibraryControllerDependencies } from "../app/use-library-controller";

const root = createRoot(document.getElementById("root")!);

function mount(dependencies: LibraryControllerDependencies = {}, demo = false) {
  root.render(
    <StrictMode>
      <PlotPileApp controllerDependencies={dependencies} demo={demo} />
    </StrictMode>,
  );
}

// The demo snapshot is fetched before the first render so the app mounts against the
// in-memory repository and never opens IndexedDB. Everyone else pays nothing for this.
if (isDemoLaunch()) {
  // The library is in memory, but filters and collapsed series would still persist to the
  // localStorage this browser's real library reads, so take those out of play too.
  setViewPreferencesEphemeral(true);
  createDemoDependencies().then(
    (dependencies) => mount(dependencies, true),
    // A failed demo load should still leave a working app rather than a blank page.
    () => mount(),
  );
} else {
  mount();
}

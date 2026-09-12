import "@fontsource-variable/dm-sans";
import "@fontsource-variable/fraunces";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { PlotPileApp } from "../app/page";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlotPileApp />
  </StrictMode>,
);

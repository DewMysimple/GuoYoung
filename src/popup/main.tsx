import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "./popup.css";
import { PopupApp } from "./popup-app";

createRoot(document.getElementById("popup-root")!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);

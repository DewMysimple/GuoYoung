import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "./styles.css";
import "./wallpaper-glass.css";
import { App } from "./App";
import { prepareAppStore } from "./lib/app-startup";

void prepareAppStore().then(store => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode><App store={store} /></StrictMode>,
  );
});

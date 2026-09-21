import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { bootPrefs, PrefsProvider } from "./prefs/Prefs";
import "./styles/global.css";

bootPrefs();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrefsProvider>
      <App />
    </PrefsProvider>
  </StrictMode>,
);

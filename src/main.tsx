import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

// Shared design system (tokens + utilities), carried over from the marketing
// site so the app matches the hero mockup exactly.
import "./styles/globals.css";
import "./styles/theme.css";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

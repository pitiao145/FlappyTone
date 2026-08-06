import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./record.css";
import { RecordApp } from "./RecordApp.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RecordApp />
  </StrictMode>,
);

import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";

const loadCss = () => import("./index.css");

// Preload theme background images for faster LCP
const preloadBackgrounds = () => {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const bgPath = isDark ? "/dark.jpg" : "/light.jpg";

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = bgPath;
  link.type = "image/jpeg";
  link.fetchPriority = "high";
  document.head.appendChild(link);
};

// Kick CSS loading as soon as the first frame can be scheduled to avoid idle delays.
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => {
    loadCss();
    preloadBackgrounds();
  });
} else {
  setTimeout(() => {
    loadCss();
    preloadBackgrounds();
  }, 0);
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);

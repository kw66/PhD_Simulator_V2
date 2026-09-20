import "./styles/global.css";
import { bootstrapApp } from "./app/v2-bootstrap";
import { bootstrapDebugWindow } from "./app/v2-debug-window";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("#app container not found");
}

const debugChannel = new URLSearchParams(window.location.search).get("debugPanel");
if (debugChannel) {
  bootstrapDebugWindow(root, debugChannel);
} else {
  bootstrapApp(root);
}

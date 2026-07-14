import "./styles/global.css";
import { bootstrapApp } from "./app/v2-bootstrap";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("#app container not found");
}

bootstrapApp(root);

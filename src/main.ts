import "./styles/global.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("#app container not found");
}

async function startApp(container: HTMLDivElement): Promise<void> {
  const parameters = new URLSearchParams(window.location.search);
  const replayId = parameters.get("replay");
  const debugChannel = parameters.get("debugPanel");
  if (replayId === "official" || replayId?.startsWith("official-")) {
    const { bootstrapReplayPlayer } = await import("./app/v2-replay-player");
    const { createOfficialReplayLibrary } = await import("./app/v2-official-replays");
    await bootstrapReplayPlayer(container, replayId || "official", { library: createOfficialReplayLibrary(), official: true });
  } else if (replayId !== null) {
    const { bootstrapReplayPlayer } = await import("./app/v2-replay-player");
    await bootstrapReplayPlayer(container, replayId || "library");
  } else if (import.meta.env.DEV && debugChannel) {
    const { bootstrapDebugWindow } = await import("./app/v2-debug-window");
    bootstrapDebugWindow(container, debugChannel);
  } else {
    const { bootstrapApp } = await import("./app/v2-bootstrap");
    await bootstrapApp(container);
  }
}

void startApp(root);

import { serializeReplayRecording, verifyReplayRecording, type ReplayRecording } from "../core/v2-local-replay";

/** Export directly to a file without adding a copy to browser storage. */
export async function downloadReplayRecording(recording: ReplayRecording): Promise<void> {
  await verifyReplayRecording(recording);
  const href = URL.createObjectURL(new Blob([serializeReplayRecording(recording)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `研究生模拟器2.0-${recording.id}.phdreplay.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

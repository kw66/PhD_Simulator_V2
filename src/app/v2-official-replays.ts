import { parseReplayRecording, serializeReplayRecording, type ReplayRecording } from "../core/v2-local-replay";
import { getRoleDefinition } from "../core/v2-progression";
import type { ReplayMetrics } from "./v2-replay-results";
import type { RoleId } from "../core/v2-types";
import type { ReplayLibrary, ReplaySummary } from "./v2-replay-library";
import manifest from "./v2-official-replay-manifest.json";

export type OfficialReplayRoute = "phd-0" | "phd-10" | "master-10" | "cursed" | "special";

interface OfficialReplayDefinition {
  id: string;
  file: string;
  roleId: RoleId;
  route: OfficialReplayRoute;
  note: string;
  strategy?: string;
  totalMonths: number;
  degree: "master" | "phd";
  score: number;
  commands: number;
  ruleset: string;
  finalDigest: string;
  metrics: ReplayMetrics;
}

const DEFINITIONS = manifest as readonly OfficialReplayDefinition[];

function summary(definition: OfficialReplayDefinition): ReplaySummary {
  const role = getRoleDefinition(definition.roleId);
  return {
    id: definition.id,
    createdAt: "2026-10-25T00:00:00.000Z",
    updatedAt: "2026-10-25T00:00:00.000Z",
    roleId: definition.roleId,
    playerName: "官方示范局",
    totalMonths: definition.totalMonths,
    degree: definition.degree,
    phase: "finished",
    ending: definition.degree,
    researchScore: definition.score,
    metrics: definition.metrics,
    commandCount: definition.commands,
    officialRoute: definition.route,
    strategy: definition.strategy ?? "稳定通过",
    officialNote: definition.note ? `${role.name} · ${definition.note}` : role.name,
  };
}

export function createOfficialReplayLibrary(): ReplayLibrary {
  const summaries = DEFINITIONS.map(summary);
  const byId = new Map(DEFINITIONS.map(definition => [definition.id, definition]));
  const cache = new Map<string, ReplayRecording>();
  return {
    async list() { return structuredClone(summaries); },
    async get(id) {
      const definition = byId.get(id);
      if (!definition) return null;
      const cached = cache.get(id);
      if (cached) return structuredClone(cached);
      const response = await fetch(`${import.meta.env.BASE_URL}official-replays/${encodeURIComponent(definition.file)}`);
      if (!response.ok) throw new Error("官方录像暂时无法读取");
      const recording = parseReplayRecording(await response.text());
      if (recording.id !== definition.id || recording.replay.ruleset !== definition.ruleset
        || recording.finalDigest !== definition.finalDigest || recording.replay.commands.length !== definition.commands) {
        throw new Error("官方录像与目录不一致，请刷新后重试");
      }
      cache.set(id, recording);
      return structuredClone(recording);
    },
    async save() { throw new Error("官方录像不可修改"); },
    async remove() { throw new Error("官方录像不可删除"); },
    async import() { throw new Error("官方录像不可导入"); },
    async export(id) { const recording = await this.get(id); if (!recording) throw new Error("找不到官方录像"); return serializeReplayRecording(recording); },
  };
}

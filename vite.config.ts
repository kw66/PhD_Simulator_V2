import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { discoverTestGroups } from "./scripts/test-groups.mjs";

const testGroup = process.env.V2_TEST_GROUP;

const LOCAL_HOST = "127.0.0.1";
const LOCAL_PORT = 4321;
const projectRoot = fileURLToPath(new URL(".", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
const generatedDirectories = ["artifacts", "tmp", ".codex-temp", "output"];

function resolveBasePath(): string {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  return process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? `/${repositoryName}/`
    : "/";
}

export default defineConfig(({ command, mode, isPreview }) => {
  // Group discovery reads every test file; normal dev/build startup does not need it.
  const isTest = mode === "test" || process.env.VITEST === "true";
  const testGroups = isTest && testGroup ? discoverTestGroups() : undefined;
  if (testGroups && testGroup && !Object.hasOwn(testGroups, testGroup)) throw new Error(`Unknown test group: ${testGroup}`);
  return {
    base: resolveBasePath(),
    // This app has one HTML entry; archived experiments are not dependency entries.
    optimizeDeps: { entries: ["index.html"] },
    // Only a source development server can grant local test progression.
    // Production builds (including --mode development) always compile this away.
    define: {
      __LOCAL_PLAYGROUND__: command === "serve" && !isPreview && mode !== "test",
    },
    server: {
      host: LOCAL_HOST,
      port: LOCAL_PORT,
      // Prune generated trees before watching; keep source, public assets and tests live.
      watch: {
        ignored: generatedDirectories.flatMap(name => [`${projectRoot}/${name}`, `${projectRoot}/${name}/**`]),
      },
    },
    preview: {
      host: LOCAL_HOST,
      port: LOCAL_PORT,
    },
    test: {
      environment: "node",
      include: testGroups && testGroup ? testGroups[testGroup as keyof typeof testGroups] : ["tests/v2-*.test.ts"],
      // Only pure rule tests run concurrently in CI. Browser shards are isolated jobs.
      fileParallelism: testGroup === "unit" || (!testGroup && process.env.CI !== "true"),
      maxWorkers: process.env.CI === "true" ? 2 : 4,
    },
  };
});

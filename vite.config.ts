import { defineConfig } from "vitest/config";
import { discoverTestGroups } from "./scripts/test-groups.mjs";

const testGroup = process.env.V2_TEST_GROUP;
const testGroups = discoverTestGroups();
if (testGroup && !Object.hasOwn(testGroups, testGroup)) throw new Error(`Unknown test group: ${testGroup}`);

const LOCAL_HOST = "127.0.0.1";
const LOCAL_PORT = 4321;

function resolveBasePath(): string {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  return process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? `/${repositoryName}/`
    : "/";
}

export default defineConfig(({ command, mode, isPreview }) => ({
  base: resolveBasePath(),
  // Only a source development server can grant local test progression.
  // Production builds (including --mode development) always compile this away.
  define: {
    __LOCAL_PLAYGROUND__: command === "serve" && !isPreview && mode !== "test",
  },
  server: {
    host: LOCAL_HOST,
    port: LOCAL_PORT,
  },
  preview: {
    host: LOCAL_HOST,
    port: LOCAL_PORT,
  },
  test: {
    environment: "node",
    include: testGroup ? testGroups[testGroup as keyof typeof testGroups] : ["tests/v2-*.test.ts"],
    // Only pure rule tests run concurrently in CI. Browser shards are isolated jobs.
    fileParallelism: testGroup === "unit" || (!testGroup && process.env.CI !== "true"),
    maxWorkers: process.env.CI === "true" ? 2 : 4,
  },
}));

import { defineConfig } from "vitest/config";

const LOCAL_HOST = "127.0.0.1";
const LOCAL_PORT = 4321;

function resolveBasePath(): string {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  return process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? `/${repositoryName}/`
    : "/";
}

export default defineConfig({
  base: resolveBasePath(),
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
    include: ["tests/v2-*.test.ts"],
  },
});

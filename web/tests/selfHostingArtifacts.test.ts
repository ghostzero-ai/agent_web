import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(process.cwd(), "..");

async function readProjectFile(relativePath: string) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

describe("single-user self-hosting artifacts", () => {
  it("keeps PostgreSQL private and persists it in a named volume", async () => {
    const compose = await readProjectFile("docker-compose.yml");
    const postgresSection = compose.split("  web:")[0];

    expect(postgresSection).toContain("postgres:16-alpine");
    expect(postgresSection).toContain("postgres-data:/var/lib/postgresql/data");
    expect(postgresSection).toContain("pg_isready");
    expect(postgresSection).not.toMatch(/\n\s+ports:/);
  });

  it("defaults web exposure to localhost and starts only after migrations", async () => {
    const [compose, dockerfile, entrypoint] = await Promise.all([
      readProjectFile("docker-compose.yml"),
      readProjectFile("web/Dockerfile"),
      readProjectFile("web/docker-entrypoint.sh"),
    ]);

    expect(compose).toContain("${APP_BIND_ADDRESS:-127.0.0.1}");
    expect(compose).toContain(
      "${CREDENTIAL_MASTER_KEY:?Set CREDENTIAL_MASTER_KEY in .env.selfhost}",
    );
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("/api/v1/health");
    expect(compose.split("  web:")[1]).not.toContain("POSTGRES_PASSWORD");
    expect(dockerfile).toContain('ENTRYPOINT ["./docker-entrypoint.sh"]');
    expect(entrypoint.indexOf("npm run db:migrate")).toBeLessThan(
      entrypoint.indexOf("exec npm run start"),
    );
  });

  it("runs migration entry scripts without CommonJS top-level await", async () => {
    const [
      migrateScript,
      rollbackScript,
      schedulerScript,
      workerScript,
      workerEntrypoint,
      compose,
      packageJson,
    ] = await Promise.all([
      readProjectFile("web/scripts/db-migrate.ts"),
      readProjectFile("web/scripts/db-rollback.ts"),
      readProjectFile("web/scripts/scheduler-claim.ts"),
      readProjectFile("web/scripts/reminder-worker.ts"),
      readProjectFile("web/worker-entrypoint.sh"),
      readProjectFile("docker-compose.yml"),
      readProjectFile("web/package.json"),
    ]);

    for (const script of [
      migrateScript,
      rollbackScript,
      schedulerScript,
      workerScript,
    ]) {
      expect(script).toContain("async function main(): Promise<void>");
      expect(script).toContain("void main().catch");
    }
    expect(packageJson).toContain('"scheduler:claim"');
    expect(packageJson).toContain('"worker:reminders"');
    expect(schedulerScript).not.toContain("run.task.prompt");
    expect(schedulerScript).not.toContain("run.task.title");
    expect(workerScript).not.toContain("task.prompt");
    expect(workerScript).not.toContain("task.title");
    expect(workerEntrypoint.indexOf("npm run db:migrate")).toBeLessThan(
      workerEntrypoint.indexOf("exec npm run worker:reminders"),
    );
    expect(compose).toContain("  worker:");
    expect(compose).toContain('entrypoint: ["./worker-entrypoint.sh"]');
  });

  it("excludes secrets and requires explicit confirmation for restore", async () => {
    const [dockerignore, gitignore, attributes, powershellRestore, shellRestore] =
      await Promise.all([
        readProjectFile("web/.dockerignore"),
        readProjectFile(".gitignore"),
        readProjectFile(".gitattributes"),
        readProjectFile("scripts/selfhost-restore.ps1"),
        readProjectFile("scripts/selfhost-restore.sh"),
      ]);

    expect(dockerignore).toContain(".env.*");
    expect(gitignore).toContain("!.env.selfhost.example");
    expect(gitignore).toContain("backups/");
    expect(attributes).toContain("*.sh text eol=lf");
    expect(powershellRestore).toContain("[switch]$ConfirmRestore");
    expect(powershellRestore).toContain("if (-not $ConfirmRestore)");
    expect(shellRestore).toContain("--confirm-restore");
    expect(powershellRestore.indexOf("stop web")).toBeLessThan(
      powershellRestore.indexOf("DROP SCHEMA"),
    );
    expect(shellRestore.indexOf("stop web")).toBeLessThan(
      shellRestore.indexOf("DROP SCHEMA"),
    );
    expect(powershellRestore).toContain("ON_ERROR_STOP=1");
    expect(shellRestore).toContain("ON_ERROR_STOP=1");
  });
});

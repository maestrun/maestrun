import { isRecord } from "../../contracts/workflow.js";
import { validRepositoryPath } from "./workspace-repositories.js";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

function validLocation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    UUID.test(value.id) &&
    typeof value.base === "string" &&
    OID.test(value.base) &&
    (value.workspace === undefined ||
      (isRecord(value.workspace) &&
        typeof value.workspace.id === "string" &&
        UUID.test(value.workspace.id) &&
        validRepositoryPath(value.workspace.path)))
  );
}

export function validWorktree(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      validLocation(value) &&
      validRepositories(value.repositories) &&
      (value.contextHash === undefined ||
        (typeof value.contextHash === "string" && OID.test(value.contextHash))) &&
      (value.result === undefined ||
        (typeof value.result === "string" && OID.test(value.result))) &&
      (value.pending === undefined || typeof value.pending === "boolean") &&
      (value.integrated === undefined || typeof value.integrated === "boolean") &&
      (value.resolving === undefined || typeof value.resolving === "boolean") &&
      (value.retained === undefined ||
        (Array.isArray(value.retained) && value.retained.every(validLocation))))
  );
}

function validRepositories(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || !value.length) return false;
  const paths: string[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !validRepositoryPath(entry.path) ||
      !isRecord(entry.worktree) ||
      entry.worktree.repositories !== undefined ||
      !validWorktree(entry.worktree)
    )
      return false;
    const current = entry.path;
    if (
      paths.some(
        (path) =>
          path === current || path.startsWith(`${current}/`) || current.startsWith(`${path}/`),
      )
    )
      return false;
    paths.push(current);
  }
  return true;
}

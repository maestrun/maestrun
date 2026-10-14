import { UserError } from "../../shared/errors.js";

export function invalidCheckpoint(message: string): never {
  throw new UserError(
    `Cannot resume saved progress: ${message}.`,
    "Preserve .maestrun/run.json. Run maestrun plan to validate a new plan after changing workflow steps, or restore the matching plan/workflow. Use a new task ID for different work.",
  );
}

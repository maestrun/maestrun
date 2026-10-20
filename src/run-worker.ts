import { runSessionWorker } from "./modules/execution/index.js";
import { reportError } from "./cli.js";

const [id, tasksPath, approval, selection] = process.argv.slice(2);
if (!id || !tasksPath || !process.send) throw new Error("Worker must be started by maestrun run.");
await runSessionWorker(
  id,
  tasksPath,
  selection
    ? { ...JSON.parse(selection), trustPlugins: approval === "--trust-plugins" }
    : approval === "--trust-plugins",
).catch(reportError);

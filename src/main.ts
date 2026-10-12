#!/usr/bin/env node
import { createApp } from "./app.js";
import { reportError } from "./cli.js";
import { ensureHomeDirectory } from "./shared/home.js";

await ensureHomeDirectory()
  .then(() => createApp().parseAsync())
  .catch(reportError);

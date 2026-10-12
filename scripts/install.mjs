import { mkdirSync } from "node:fs";
import { homedir, release } from "node:os";
import { join } from "node:path";
const [major, minor] = process.versions.node.split(".").map(Number);
if (!((major === 22 && minor >= 13) || major === 24 || major >= 26)) {
  console.error(
    "Maestrun needs Node.js 24 LTS (also supported: 22.13+, 26+). Install a supported version and retry.",
  );
  process.exit(1);
}
if (process.platform === "win32") {
  console.error(
    "Maestrun requires WSL on Windows. Run wsl --install, then install Node.js and Maestrun inside Linux.",
  );
  process.exit(1);
}
if (/microsoft|wsl/i.test(release()))
  console.log(
    "WSL detected. Run Maestrun and authenticate executors inside this Linux distribution.",
  );
mkdirSync(join(homedir(), ".maestrun"), { recursive: true, mode: 0o700 });

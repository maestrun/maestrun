export class UserError extends Error {
  constructor(
    message: string,
    readonly nextAction: string,
  ) {
    super(message);
    this.name = "UserError";
  }
}

export class BackError extends Error {
  constructor() {
    super("Back");
  }
}

export class RefactorError extends UserError {}

export class StepFailedError extends UserError {}
export class AuthenticationRequiredError extends UserError {}

export class StepInputRequired extends Error {
  constructor(
    readonly question: string,
    readonly summary: string,
  ) {
    super(question);
  }
}

export class CancelError extends Error {
  constructor() {
    super("Cancelled");
  }
}

export function isCancellation(error: unknown): boolean {
  return (
    error instanceof CancelError ||
    (error instanceof Error &&
      ["ExitPromptError", "AbortPromptError", "AbortError"].includes(error.name))
  );
}

export function fileFailure(message: string): UserError {
  return new UserError(message, "Check the path and file permissions, then retry the command.");
}

const AUTH_COMMANDS: Readonly<Record<string, string>> = {
  "Grok Build": "grok login",
  Codex: "codex login",
  codex: "codex login",
  "Claude Code": "claude auth login",
  claude: "claude auth login",
  "GitHub Copilot": "copilot login",
};

export function executorFailure(id: string, details: string): UserError {
  if (
    /model.{0,100}(not found|unsupported|unavailable|invalid|not exist)|invalid.{0,30}model/isu.test(
      details,
    )
  ) {
    return new UserError(
      `${id} could not use the selected model.`,
      "Run maestrun init and choose a model available to your account.",
    );
  }
  if (/auth|login|sign in|unauthorized|401/iu.test(details)) {
    const login = AUTH_COMMANDS[id] ?? "claude auth login";
    return new AuthenticationRequiredError(
      `${id} requires authentication.`,
      `Run ${login}, then retry the command.`,
    );
  }
  if (/quota|rate.?limit|usage.?limit|429/iu.test(details)) {
    return new UserError(
      `${id} reached its usage limit.`,
      "Check your executor account usage, then retry the command.",
    );
  }
  return new UserError(
    `${id} could not complete the request.`,
    "Check the selected model and executor account, then retry the command.",
  );
}

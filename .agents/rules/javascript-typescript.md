# JavaScript and TypeScript rules

These rules apply to JavaScript and TypeScript application code in `backend`,
`frontend`, and `tests`. Prefer TypeScript for new application code.

## Variables and equality

- Always use `const` by default and `let` only when reassignment is required.
  Never use `var`.
- Always use strict equality: `===` and `!==`. Never use `==` or `!=`.
- Declare one variable per statement and keep variable scope as small as
  practical.
- Use named constants for non-obvious repeated values; do not mutate function
  parameters or shared module state.

## Types

- Never use `any`. Accept `unknown` at untrusted boundaries and validate or
  narrow it before use.
- Prefer `type` aliases over `interface`, unless declaration merging or a
  library API specifically requires an interface.
- Type every parameter and return value that is an object, array, tuple, or
  promise of one. Exported functions must declare their return type.
- Use narrow domain types, string unions, and discriminated unions instead of
  broad primitives or casts. Prefer `Readonly` data where mutation is not part
  of the contract.
- Do not use non-null assertions (`!`) or unchecked type assertions. Model the
  uncertainty or validate the value instead.

## Functions and expressions

- Use named `function` declarations for main module functions and exported
  behavior. Use arrow functions for callbacks, including `map`, `filter`,
  `reduce`, promise handlers, and event handlers.
- Keep callbacks small; extract named functions when their behavior needs more
  than a simple expression.
- Use a ternary expression for a simple conditional assignment or return. Keep
  it compact without vertically aligning its branches; use `if` for complex or
  nested conditions.
- Use optional chaining and nullish coalescing only when `null` or `undefined`
  are valid expected states. Do not use `||` when values such as `0`, `false`,
  or an empty string must be retained.

## Reliability and maintainability

- Enable strict TypeScript and linting rules. Do not suppress errors with
  `@ts-ignore`, `@ts-nocheck`, or broad lint-disable comments; fix the cause or
  add the narrowest justified exception.
- Handle promises deliberately. Await required work and explicitly handle
  intentional fire-and-forget rejections.
- Avoid implicit coercion, `eval`, dynamic code execution, and mutation-heavy
  array methods. Prefer immutable transformations when they remain clear.
- Validate external input at the boundary and pass typed, normalized values to
  the rest of the application.
- Run the relevant linter after every task and resolve its findings before
  completion. Also run type checking when TypeScript code or configuration
  changes.

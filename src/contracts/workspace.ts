export function validRepositoryPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !/[\\:\p{Cc}]/u.test(path) &&
    path.split("/").every((part) => Boolean(part) && part !== "." && part !== "..")
  );
}

export function validRepositorySelection(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(validRepositoryPath) &&
    value.every(
      (path: string, index) =>
        !value.some(
          (other: string, otherIndex) =>
            index !== otherIndex && (path === other || path.startsWith(`${other}/`)),
        ),
    )
  );
}

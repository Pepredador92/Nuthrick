export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function emptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return !value.trim();
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value))
    return value.length === 0 || value.every(emptyValue);
  if (isRecord(value)) return Object.values(value).every(emptyValue);
  return false; // false and zero are real answers, never missing values.
}

export function matchesCondition(
  condition: Record<string, unknown> | null | undefined,
  values: Record<string, unknown>,
): boolean {
  if (!condition) return true;
  if (Array.isArray(condition.any))
    return condition.any.some(
      (item) => isRecord(item) && matchesCondition(item, values),
    );
  if (Array.isArray(condition.all))
    return condition.all.every(
      (item) => isRecord(item) && matchesCondition(item, values),
    );
  if (typeof condition.question_key !== "string") return true;
  const value = values[condition.question_key];
  if ("equals" in condition) return value === condition.equals;
  if ("contains" in condition)
    return Array.isArray(value)
      ? value.includes(condition.contains)
      : value === condition.contains;
  if (Array.isArray(condition.in)) return condition.in.includes(value);
  if (Array.isArray(condition.any_except)) {
    const excluded = condition.any_except;
    return (
      !emptyValue(value) &&
      (Array.isArray(value)
        ? value.some((item) => !excluded.includes(item))
        : !excluded.includes(value))
    );
  }
  return !emptyValue(value) && value !== false;
}

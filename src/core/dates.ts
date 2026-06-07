export function dateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString().slice(0, 10);
}

export function today(): string {
  return dateOnly(new Date());
}

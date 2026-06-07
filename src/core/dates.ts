export function dateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function today(): string {
  return dateOnly(new Date());
}

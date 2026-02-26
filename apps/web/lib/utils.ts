import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function normalizeErrorDetail(detail: unknown): string {
  if (!detail) return "Request failed";
  if (Array.isArray(detail)) {
    return detail
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const record = part as { msg?: unknown; loc?: unknown };
          const msg = typeof record.msg === "string" ? record.msg : JSON.stringify(part);
          const loc = Array.isArray(record.loc)
            ? record.loc
                .map((segment) => String(segment))
                .filter((segment) => segment !== "body")
                .join(".")
            : "";
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(part);
      })
      .join("; ");
  }
  if (typeof detail === "object") return JSON.stringify(detail);
  return String(detail);
}

export function parseEmailList(input: string): string[] {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

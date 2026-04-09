/**
 * Shared formatting utilities used across all pages.
 * Centralizes timestamp formatting and severity badge mapping
 * to eliminate duplication and ensure consistency.
 */

/** Format an ISO timestamp string into a human-readable locale string. */
export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * All severity levels the backend can produce.
 * "Low" was previously missing from frontend badge mapping.
 */
export type AlertSeverity = "Critical" | "High" | "Medium" | "Low";

/** Map a severity string to its CSS badge class name. */
export function getSeverityBadgeClass(severity: string): string {
  switch (severity) {
    case "Critical":
      return "critical";
    case "High":
      return "high";
    case "Medium":
      return "medium";
    case "Low":
      return "low";
    default:
      return "neutral";
  }
}

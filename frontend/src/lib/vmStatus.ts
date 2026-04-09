function normalizeVmStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase() ?? "";

  if (normalized.includes("restarting")) {
    return "restarting";
  }

  if (normalized.includes("starting")) {
    return "starting";
  }

  if (normalized.includes("stopping")) {
    return "stopping";
  }

  if (normalized.includes("deallocating")) {
    return "deallocating";
  }

  if (normalized.includes("deallocated")) {
    return "deallocated";
  }

  if (normalized.includes("stopped")) {
    return "stopped";
  }

  if (normalized.includes("running") || normalized === "online") {
    return "running";
  }

  return "unknown";
}

export function isVmRunning(status: string | null | undefined) {
  return normalizeVmStatus(status) === "running";
}

export function getVmBadgeTone(status: string | null | undefined) {
  const normalized = normalizeVmStatus(status);

  if (normalized === "running") {
    return "online";
  }

  if (
    normalized === "starting" ||
    normalized === "restarting" ||
    normalized === "stopping" ||
    normalized === "deallocating"
  ) {
    return "medium";
  }

  return "offline";
}

export function getVmAssetLabel(status: string | null | undefined) {
  switch (normalizeVmStatus(status)) {
    case "running":
      return "RUNNING";
    case "starting":
      return "STARTING";
    case "restarting":
      return "RESTARTING";
    case "stopping":
      return "STOPPING";
    case "deallocating":
      return "STOPPING";
    case "deallocated":
      return "STOPPED";
    case "stopped":
      return "STOPPED";
    default:
      return "UNKNOWN";
  }
}

export function getVmDashboardLabel(status: string | null | undefined) {
  switch (normalizeVmStatus(status)) {
    case "running":
      return "VM running";
    case "starting":
      return "VM starting";
    case "restarting":
      return "VM restarting";
    case "stopping":
      return "VM stopping";
    case "deallocating":
      return "VM stopping";
    case "deallocated":
      return "VM stopped";
    case "stopped":
      return "VM stopped";
    default:
      return status?.trim() || "VM unknown";
  }
}

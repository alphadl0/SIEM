import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import * as signalR from "@microsoft/signalr";
import {
  acquireApiAccessToken,
  buildBackendUrl,
  fetchApiJson,
  getKnownBackendUrls,
  type PagedResponse,
  rememberBackendUrl,
} from "../lib/backend";

export interface VmStatusEvent {
  vmName: string;
  status: string;
  location?: string;
  vmSize?: string;
  osLabel?: string;
  osVersion?: string;
  privateIpAddress?: string;
  publicIpAddress?: string;
  memoryUsedGb?: number;
  memoryTotalGb?: number;
  diskUsedGb?: number;
  diskTotalGb?: number;
}

export interface AlertEvent {
  useCaseId: string;
  title: string;
  severity: string;
  vm: string;
  sourceIp: string;
  description: string;
  timestamp: string;
  geo?: {
    country: string;
    city: string;
    isp: string;
    lat?: number;
    lon?: number;
  };
}

export type SignalRConnectionStatus =
  | "Idle"
  | "Connecting"
  | "Connected"
  | "Reconnecting"
  | "Disconnected"
  | "Unauthorized";

interface PollStatusEvent {
  status: string;
  timestamp: string;
}

interface SignalRState {
  connection: signalR.HubConnection | null;
  vmStatuses: Record<string, VmStatusEvent>;
  alerts: AlertEvent[];
  lastPoll: PollStatusEvent | null;
  connectionStatus: SignalRConnectionStatus;
  connectionError: string | null;
}

const SignalRContext = createContext<SignalRState | null>(null);

export function SignalRProvider({ children }: { children: ReactNode }) {
  const value = useProvideSignalR();
  return createElement(SignalRContext.Provider, { value }, children);
}

export function useSignalR() {
  const value = useContext(SignalRContext);

  if (!value) {
    throw new Error("useSignalR must be used within SignalRProvider.");
  }

  return value;
}

function useProvideSignalR(): SignalRState {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const retryTimerRef = useRef<number | null>(null);

  const [connection, setConnection] = useState<signalR.HubConnection | null>(
    null,
  );
  const [vmStatuses, setVmStatuses] = useState<Record<string, VmStatusEvent>>(
    {},
  );
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [lastPoll, setLastPoll] = useState<PollStatusEvent | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<SignalRConnectionStatus>("Idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrateRealtimeState = async (activeAccount: AccountInfo) => {
      const [alertsResult, vmStatusesResult] = await Promise.allSettled([
        fetchApiJson<PagedResponse<AlertEvent>>(
          instance,
          activeAccount,
          "/api/alerts?page=1&pageSize=100",
        ),
        fetchApiJson<VmStatusEvent[]>(
          instance,
          activeAccount,
          "/api/vm-statuses",
        ),
      ]);

      if (cancelled) {
        return;
      }

      if (alertsResult.status === "fulfilled") {
        setAlerts((previous) => mergeAlerts(alertsResult.value.items, previous));
      } else {
        console.warn("Failed to hydrate realtime alerts", alertsResult.reason);
      }

      if (vmStatusesResult.status === "fulfilled") {
        setVmStatuses((previous) =>
          mergeVmStatuses(vmStatusesResult.value, previous),
        );
      } else {
        console.warn(
          "Failed to hydrate realtime VM statuses",
          vmStatusesResult.reason,
        );
      }
    };

    if (!account) {
      return () => {
        cancelled = true;
      };
    }

    void hydrateRealtimeState(account);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.homeAccountId, instance]);

  useEffect(() => {
    let cancelled = false;

    const stopConnection = async () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      const activeConnection = connectionRef.current;
      connectionRef.current = null;
      setConnection(null);

      if (activeConnection) {
        try {
          await activeConnection.stop();
        } catch (error) {
          console.warn("SignalR stop error", error);
        }
      }
    };

    if (!account) {
      setTimeout(() => {
        setVmStatuses({});
        setAlerts([]);
        setLastPoll(null);
        setConnectionStatus("Idle");
        setConnectionError(null);
      }, 0);
      void stopConnection();
      return;
    }

    const connect = async (activeAccount: AccountInfo) => {
      setConnectionStatus("Connecting");
      setConnectionError(null);
      await stopConnection();

      let lastError: unknown = null;

      for (const baseUrl of getKnownBackendUrls()) {
        const nextConnection = createConnection(
          activeAccount,
          baseUrl,
          instance,
          setVmStatuses,
          setAlerts,
          setLastPoll,
          setConnectionStatus,
          setConnectionError,
          () => cancelled,
        );

        try {
          await nextConnection.start();

          if (cancelled) {
            await nextConnection.stop();
            return;
          }

          rememberBackendUrl(baseUrl);
          connectionRef.current = nextConnection;
          setConnection(nextConnection);
          setConnectionStatus("Connected");
          setConnectionError(null);
          return;
        } catch (error) {
          lastError = error;

          try {
            await nextConnection.stop();
          } catch {
            // Ignore cleanup errors from failed starts.
          }

          if (isUnauthorizedError(error)) {
            break;
          }
        }
      }

      if (!cancelled) {
        setConnectionStatus(
          isUnauthorizedError(lastError) ? "Unauthorized" : "Disconnected",
        );
        setConnectionError(getErrorMessage(lastError));

        if (!isUnauthorizedError(lastError)) {
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            void connect(activeAccount);
          }, 5000);
        }
      }
    };

    void connect(account);

    return () => {
      cancelled = true;
      void stopConnection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.homeAccountId, instance]);

  return useMemo(
    () => ({
      connection,
      vmStatuses,
      alerts,
      lastPoll,
      connectionStatus,
      connectionError,
    }),
    [alerts, connection, connectionError, connectionStatus, lastPoll, vmStatuses],
  );
}

function createConnection(
  activeAccount: AccountInfo,
  baseUrl: string,
  instance: ReturnType<typeof useMsal>["instance"],
  setVmStatuses: React.Dispatch<React.SetStateAction<Record<string, VmStatusEvent>>>,
  setAlerts: React.Dispatch<React.SetStateAction<AlertEvent[]>>,
  setLastPoll: React.Dispatch<React.SetStateAction<PollStatusEvent | null>>,
  setConnectionStatus: React.Dispatch<React.SetStateAction<SignalRConnectionStatus>>,
  setConnectionError: React.Dispatch<React.SetStateAction<string | null>>,
  isCancelled: () => boolean,
) {
  const nextConnection = new signalR.HubConnectionBuilder()
    .withUrl(buildBackendUrl("/hub", baseUrl), {
      accessTokenFactory: async () =>
        acquireApiAccessToken(instance, activeAccount),
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000])
    .configureLogging(
      import.meta.env.DEV
        ? signalR.LogLevel.Information
        : signalR.LogLevel.Warning,
    )
    .build();

  nextConnection.on("vmStatus", (message: VmStatusEvent) => {
    setVmStatuses((previous) => ({ ...previous, [message.vmName]: message }));
  });

  nextConnection.on("newAlert", (alert: AlertEvent) => {
    setAlerts((previous) => mergeAlerts([alert], previous));
  });

  nextConnection.on("pollStatus", (status: PollStatusEvent) => {
    setLastPoll(status);
  });

  nextConnection.onreconnecting((error) => {
    if (isCancelled()) {
      return;
    }

    setConnectionStatus(
      isUnauthorizedError(error) ? "Unauthorized" : "Reconnecting",
    );
    setConnectionError(error ? getErrorMessage(error) : null);
  });

  nextConnection.onreconnected(() => {
    if (isCancelled()) {
      return;
    }

    setConnectionStatus("Connected");
    setConnectionError(null);
  });

  nextConnection.onclose((error) => {
    if (isCancelled()) {
      return;
    }

    setConnectionStatus(
      isUnauthorizedError(error) ? "Unauthorized" : "Disconnected",
    );
    setConnectionError(error ? getErrorMessage(error) : null);
  });

  return nextConnection;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected realtime connection failure.";
}

function isUnauthorizedError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error.statusCode === 401 || error.statusCode === 403)
  ) {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("401") ||
    message.includes("403") ||
    message.includes("unauthorized") ||
    message.includes("forbidden")
  );
}

function mergeAlerts(
  incomingAlerts: AlertEvent[],
  existingAlerts: AlertEvent[],
) {
  const merged = new Map<string, AlertEvent>();

  for (const alert of [...incomingAlerts, ...existingAlerts]) {
    merged.set(createAlertKey(alert), alert);
  }

  return Array.from(merged.values())
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    )
    .slice(0, 100);
}

function createAlertKey(alert: AlertEvent) {
  return [
    alert.timestamp,
    alert.useCaseId,
    alert.vm,
    alert.sourceIp,
    alert.description,
  ].join("|");
}

function mergeVmStatuses(
  incomingStatuses: VmStatusEvent[],
  existingStatuses: Record<string, VmStatusEvent>,
) {
  const nextStatuses = { ...existingStatuses };

  for (const status of incomingStatuses) {
    nextStatuses[status.vmName] = {
      ...nextStatuses[status.vmName],
      ...status,
    };
  }

  return nextStatuses;
}

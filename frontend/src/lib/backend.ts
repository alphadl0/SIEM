import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type IPublicClientApplication,
  type SilentRequest,
} from "@azure/msal-browser";
import { loginRequest } from "../authConfig";

const DEFAULT_BACKEND_URL = import.meta.env.DEV
  ? "http://localhost:5113"
  : "https://localhost:7031";

let backendUrl = getInitialBackendUrl();

export interface PagedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  failedCount?: number;
}

export function buildBackendUrl(path: string, baseUrl = backendUrl) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function acquireApiAccessToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
) {
  const request: SilentRequest = {
    ...loginRequest,
    account,
  };

  try {
    const response = await instance.acquireTokenSilent(request);
    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await instance.loginRedirect(loginRequest);
    }

    throw error;
  }
}

export async function fetchApiJson<T>(
  instance: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  init: RequestInit = {},
) {
  const accessToken = await acquireApiAccessToken(instance, account);
  const baseUrl = getInitialBackendUrl();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  const doFetch = async () => {
    const response = await fetch(buildBackendUrl(path, baseUrl), {
      ...init,
      headers,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`API request failed with status ${response.status}: ${detail || response.statusText}`);
    }

    return (await response.json()) as T;
  };

  try {
    return await doFetch();
  } catch (error) {
    // Retry once on transient failures for GET requests
    if (!init.method || init.method === "GET") {
      const msg = error instanceof Error ? error.message : "";
      const isTransient =
        msg.includes("429") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError");
      if (isTransient) {
        await new Promise((r) => setTimeout(r, 1500));
        return await doFetch();
      }
    }
    throw error instanceof Error ? error : new Error("Failed to fetch");
  }
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function getInitialBackendUrl() {
  return normalizeUrl(import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND_URL);
}

export function getKnownBackendUrls() {
  return [getInitialBackendUrl()];
}

export function rememberBackendUrl(url: string) {
  backendUrl = normalizeUrl(url);
}

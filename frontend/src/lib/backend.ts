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

const BACKEND_URL_STORAGE_KEY = "siem.backendUrl";
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

  try {
    const response = await fetch(buildBackendUrl(path, baseUrl), {
      ...init,
      headers,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`API request failed with status ${response.status}: ${detail || response.statusText}`);
    }

    return (await response.json()) as T;
  } catch (error) {
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

function addKnownUrl(urls: Set<string>, url: string | null | undefined) {
  if (!url) {
    return;
  }
  urls.add(normalizeUrl(url));
}

export function rememberBackendUrl(url: string) {
  backendUrl = normalizeUrl(url);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(BACKEND_URL_STORAGE_KEY, backendUrl);
  }
}

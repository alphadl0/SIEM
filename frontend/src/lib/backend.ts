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
  let lastError: Error | null = null;

  for (const baseUrl of getKnownBackendUrls()) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);

    try {
      const response = await fetch(buildBackendUrl(path, baseUrl), {
        ...init,
        headers,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        const error = new Error(
          `API request failed with status ${response.status}: ${detail || response.statusText}`,
        );

        if (response.status === 404 || response.status === 405) {
          lastError = error;
          continue;
        }

        throw error;
      }

      rememberBackendUrl(baseUrl);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Failed to fetch");
      if (!isRetriableFetchError(lastError)) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("Failed to fetch");
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function getInitialBackendUrl() {
  const knownUrls = getKnownBackendUrls();
  return knownUrls[0] ?? normalizeUrl(import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND_URL);
}

export function getKnownBackendUrls() {
  const urls = new Set<string>();
  const configuredUrl = import.meta.env.VITE_BACKEND_URL;
  const storedUrl = typeof window !== "undefined"
    ? window.localStorage.getItem(BACKEND_URL_STORAGE_KEY)
    : null;
  const host = typeof window !== "undefined" ? window.location.hostname : "";

  addKnownUrl(urls, storedUrl);
  addKnownUrl(urls, configuredUrl);
  
  if (typeof window !== "undefined" && window.location.origin) {
    addKnownUrl(urls, window.location.origin);
  }

  addKnownUrl(urls, DEFAULT_BACKEND_URL);

  if (host === "localhost" || host === "127.0.0.1") {
    addKnownUrl(urls, `http://${host}:5113`);
    addKnownUrl(urls, `https://${host}:7031`);
  }

  addKnownUrl(urls, "http://localhost:5113");
  addKnownUrl(urls, "http://127.0.0.1:5113");
  addKnownUrl(urls, "https://localhost:7031");
  addKnownUrl(urls, "https://127.0.0.1:7031");

  return Array.from(urls);
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

function isRetriableFetchError(error: Error) {
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("404") ||
    message.includes("405")
  );
}

import { type Configuration } from "@azure/msal-browser";

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID?.trim();
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID?.trim();
const configuredBackendScope = import.meta.env.VITE_BACKEND_SCOPE?.trim();

export const backendScope =
  configuredBackendScope ||
  (clientId && !clientId.startsWith("ENTER_")
    ? `api://${clientId}/access_as_user`
    : "");

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId || "ENTER_CLIENT_ID_HERE",
    authority: tenantId
      ? `https://login.microsoftonline.com/${tenantId}`
      : "https://login.microsoftonline.com/common",
    redirectUri: typeof window !== "undefined" ? window.location.origin : "/",
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
};

export const loginRequest = {
  scopes: backendScope ? [backendScope] : [],
};

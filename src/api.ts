import { AppOperation, AppOperationRequest } from "./AppOperation";

export const QUERY_KEYS = {
  LOGIN: "login",
  GET_PROFILE: "get_profile",
  // Add more keys as needed in your app.
} as const;

export type QueryKey = (typeof QUERY_KEYS)[keyof typeof QUERY_KEYS];

export type Requests = Record<QueryKey, AppOperationRequest>;

const requests: Requests = {
  [QUERY_KEYS.LOGIN]: {
    method: "POST",
    url: "auth/login",
  },
  [QUERY_KEYS.GET_PROFILE]: {
    method: "GET",
    url: "profile/",
  },
};

const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://example.com/api/v1/";

const DEFAULT_SYSTEM_KEY = process.env.EXPO_PUBLIC_SYSTEM_KEY;

export const appOperation = new AppOperation<Requests>(
  DEFAULT_API_URL,
  requests,
  {
    staticHeaders: DEFAULT_SYSTEM_KEY
      ? { "System-Key": DEFAULT_SYSTEM_KEY }
      : {},
  },
);

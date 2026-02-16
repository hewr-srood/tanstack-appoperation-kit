## TanStack AppOperation Kit

Centralized API requests + TanStack Query pattern for React Native / Expo (and adaptable to React).

This repo extracts the pattern you are using in your app:

- A single `AppOperation` class that owns:
  - Base URL and environment configuration.
  - Static headers (set once) and dynamic headers (computed on each request).
  - Error handling and toast messages via optional handlers.
- A `QUERY_KEYS` enum and `requests` map as the **single source of truth** for all endpoints.
- A single `appOperation.getRequest` method used from **all** `useQuery` / `useMutation` hooks.
- A shared `queryClient` and `QueryClientProvider` for TanStack Query.

You can publish this folder as its own repo and reuse it across projects.

---

### 1. Installation

This kit assumes:

- TypeScript
- React or React Native (Expo recommended)
- `@tanstack/react-query`

Install the required packages in your app:

```bash
pnpm add @tanstack/react-query
# or: npm install @tanstack/react-query
```

If you're using React Native / Expo and want to copy the exact behavior from your current app, you'll also need:

- `expo-localization` (for time zone)
- `toastify-react-native` (for toasts)

```bash
expo install expo-localization
pnpm add toastify-react-native
```

---

### 2. Structure

Proposed repo structure:

```text
tanstack-appoperation-kit/
  README.md
  src/
    AppOperation.ts      # Core request class
    api.ts               # QUERY_KEYS + requests + appOperation
    queryClient.ts       # Shared QueryClient
    index.ts             # Re-exports
  .cursor/
    skills/
      tanstack-appoperation-requests/
        SKILL.md         # Cursor skill to enforce this pattern
```

You can keep it as a library-only repo or copy the files directly into your app's `shared/services` and `shared/utils`.

---

### 3. Core APIs

#### `AppOperation`

Located in `src/AppOperation.ts`.

Responsibilities:

- Build full URLs using `baseUrl + request.url + id + pathExtension`.
- Attach headers:
  - **Static headers** (set once, e.g. `System-Key`, app version, platform).
  - **Dynamic headers** (computed on each request, e.g. `Authorization`, `Accept-Language`, `x-country`).
- Handle:
  - JSON parsing.
  - Network and JSON errors with human-readable messages.
  - Toasts for success and error statuses (via optional toast handler).

Key methods:

- `getRequest({ request, body, params, id, suppressToast, pathExtension })`
- Static header management:
  - `setStaticHeader(key, value)` - Add or update a static header
  - `deleteStaticHeader(key)` - Remove a static header
- Dynamic header management:
  - `setDynamicHeadersResolver(resolver)` - Set a function that returns dynamic headers for each request
- Toast handler:
  - `setToastHandler(handler)` - Set a custom toast handler function

#### `api.ts`

Contains:

- `QUERY_KEYS` object (`as const`) — one entry per logical operation.
- `AppOperationRequest` & `Requests` mapped type based on `QueryKey`.
- `requests` object mapping keys to `{ method, url }`.
- `appOperation` (and optionally a wrapped instance in your app).

This is the only place you should define endpoints.

##### Toast handling

You configure how toasts look once, when creating your `appOperation` instance, by passing a `showToast` callback. `AppOperation` decides **when** to show a toast; your app decides **how**:

```ts
import { AppOperation, AppOperationRequest } from "tanstack-appoperation-kit";
// or use a relative import if you've copied the files

export const appOperation = new AppOperation<Requests>(baseUrl, requests, {
  showToast: (type, message) => {
    // Example for toastify-react-native
    Toast.show({ type, text1: message });

    // Example for web with react-toastify:
    // if (type === "success") toast.success(message);
    // else toast.error(message);
  },
});
```

You can also change this behavior later at runtime:

```ts
appOperation.setToastHandler((type, message) => {
  // swap toast library, change styling, etc.
});
```

For calls where you **don’t** want any toast (e.g. silent background refresh), you can suppress it per call:

```ts
appOperation.getRequest({ request: QUERY_KEYS.GET_PROFILE }); // normal (toasts)

appOperation.getRequest({
  request: QUERY_KEYS.GET_PROFILE,
  suppressToast: true, // silent
});
```

#### `queryClient.ts`

Exports a `queryClient` configured for your app:

- Default query settings (retry, stale time, etc) if you want.
- Used in your root layout via `QueryClientProvider`.

---

### 4. Using in Your App

#### 4.1 Wrap your app with `QueryClientProvider`

In your root layout (e.g. `app/_layout.tsx` for Expo Router, or `App.tsx`):

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "tanstack-appoperation-kit"; // or relative path

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* rest of your providers and navigation */}
    </QueryClientProvider>
  );
}
```

#### 4.2 Add endpoints to `QUERY_KEYS` and `requests`

In `src/api.ts`:

```ts
export const QUERY_KEYS = {
  LOGIN: "login",
  GET_PROFILE: "get_profile",
  // add more here...
} as const;

export type QueryKey = (typeof QUERY_KEYS)[keyof typeof QUERY_KEYS];

export type Requests = Record<QueryKey, AppOperationRequest>;

const requests: Requests = {
  [QUERY_KEYS.LOGIN]: { method: "POST", url: "auth/login" },
  [QUERY_KEYS.GET_PROFILE]: { method: "GET", url: "profile/" },
};
```

Then create the instance:

```ts
const baseUrl =
  process.env.EXPO_PUBLIC_API_URL ?? "https://example.com/api/v1/";

export const appOperation = new AppOperation<Requests>(baseUrl, requests, {
  // Optional: Set static headers that don't change (e.g. System-Key)
  staticHeaders: {
    "System-Key": process.env.EXPO_PUBLIC_SYSTEM_KEY ?? "",
  },
  // Optional: Set dynamic headers resolver (called on each request)
  getDynamicHeaders: () => ({
    // These headers are computed dynamically, e.g. from context/state
    Authorization: `Bearer ${getToken()}`,
    "Accept-Language": getLanguage(),
    "x-country": getCountry(),
  }),
  // Optional: Set toast handler for success/error messages
  showToast: (type, message) => {
    // Your toast implementation here
    Toast.show({ type, text1: message });
  },
});
```

#### 4.3 Use in `useQuery`

```tsx
import { useQuery } from "@tanstack/react-query";
import { appOperation, QUERY_KEYS } from "tanstack-appoperation-kit"; // or relative

const profileQuery = useQuery({
  queryKey: [QUERY_KEYS.GET_PROFILE],
  queryFn: () =>
    appOperation.getRequest({
      request: QUERY_KEYS.GET_PROFILE,
    }),
});
```

#### 4.4 Use in `useMutation`

```tsx
import { useMutation } from "@tanstack/react-query";
import { appOperation, QUERY_KEYS } from "tanstack-appoperation-kit";

const loginMutation = useMutation({
  mutationKey: [QUERY_KEYS.LOGIN],
  mutationFn: (body: { email_or_phone: string; password: string }) =>
    appOperation.getRequest({
      request: QUERY_KEYS.LOGIN,
      body,
    }),
});
```

#### 4.5 Manage auth / context

The new dynamic header pattern uses a resolver function that's called on each request. This allows headers to be computed from your app's current state (e.g., auth context, user preferences).

**Option 1: Set dynamic headers resolver at initialization** (recommended)

```ts
// In your api.ts or where you create appOperation
export const appOperation = new AppOperation<Requests>(baseUrl, requests, {
  getDynamicHeaders: () => {
    const token = authStore.getToken(); // Your auth state management
    const language = i18nStore.getLanguage(); // Your i18n state
    const country = userStore.getCountry(); // Your user state

    return {
      Authorization: token ? `Bearer ${token}` : "",
      "Accept-Language": language ?? "en",
      "x-country": country ?? "IQ",
    };
  },
});
```

**Option 2: Update dynamic headers resolver at runtime**

```ts
// After login or when user preferences change
appOperation.setDynamicHeadersResolver(() => {
  return {
    Authorization: `Bearer ${newToken}`,
    "Accept-Language": newLanguage,
    "x-country": newCountry,
  };
});
```

**Managing static headers:**

```ts
// Add or update a static header
appOperation.setStaticHeader("System-Key", "your-system-key");

// Remove a static header
appOperation.deleteStaticHeader("System-Key");
```

This pattern keeps all header logic centralized and allows headers to be computed from your app's current state on each request.

---

### 5. Cursor Skill Integration

This kit is designed to work together with the `tanstack-appoperation-requests` Cursor skill. To reuse it:

#### 5.1 Install via GitHub Remote Skills (Recommended)

You can install this skillset directly into Cursor using GitHub Remote Skills:

1. **Open Cursor Settings**
   - Press `Cmd+,` (or `Ctrl+,` on Windows/Linux) to open Settings
   - Navigate to the **Skills** section

2. **Add the GitHub skill repository**
   - Click **"Add skill from GitHub"** (or similar button in the Skills UI)
   - Paste this repository URL:
     ```
     https://github.com/hewr-srood/tanstack-appoperation-kit.git
     ```
   - Confirm to install

3. **Enable the skill**
   - After installation, ensure the skillset is **enabled** in your Skills list
   - Cursor will automatically load the skill's instructions when working with projects that use this pattern

#### 5.2 Manual Installation (Alternative)

Alternatively, you can manually copy the skill:

1. Copy the `tanstack-appoperation-requests` skill directory from this repo into:
   - Your project's `.cursor/skills/` folder, and/or
   - Your personal skills at `~/.cursor/skills/tanstack-appoperation-requests/`.

#### Benefits

When working in any project that uses this kit, Cursor will:

- Prefer `appOperation.getRequest` over raw `fetch`
- Add new endpoints via `QUERY_KEYS` + `requests`
- Wire queries and mutations correctly into TanStack Query

This gives you a repeatable, documented pattern you can drop into any app.

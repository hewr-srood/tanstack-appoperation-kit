export type AppOperationRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
};

/**
 * Core HTTP wrapper used by all apps (framework-agnostic).
 *
 * - Centralizes headers.
 * - Wraps fetch and JSON handling.
 * - Provides a single getRequest({ request, ... }) entry point.
 */
export class AppOperation<
  Requests extends {
    [key: string]: AppOperationRequest;
  },
> {
  private readonly baseUrl: string;
  private readonly requests: Requests;

  private staticHeaders: Record<string, string>;
  private getDynamicHeaders?: () => Record<string, string>;
  private showToast?: (type: "success" | "error", message: string) => void;

  constructor(
    baseUrl: string,
    requests: Requests,
    options?: {
      /**
       * Headers that are always sent with each request
       * (e.g. System-Key, app version, platform).
       */
      staticHeaders?: Record<string, string>;
      /**
       * Function that returns headers that may change over time
       * (e.g. Authorization token, language, currency, branch, country).
       */
      getDynamicHeaders?: () => Record<string, string>;
      /**
       * Hook for UI-specific toast handling.
       * If provided, AppOperation will call this instead of assuming any
       * particular toast library.
       */
      showToast?: (type: "success" | "error", message: string) => void;
    },
  ) {
    this.baseUrl = baseUrl;
    this.requests = requests;

    this.staticHeaders = options?.staticHeaders ?? {};
    this.getDynamicHeaders = options?.getDynamicHeaders;
    this.showToast = options?.showToast;
  }

  /**
   * Update or add a static header at runtime.
   */
  public setStaticHeader(key: string, value: string) {
    this.staticHeaders[key] = value;
  }

  /**
   * Remove a static header.
   */
  public deleteStaticHeader(key: string) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.staticHeaders[key];
  }

  /**
   * Replace the dynamic headers function.
   */
  public setDynamicHeadersResolver(resolver: () => Record<string, string>) {
    this.getDynamicHeaders = resolver;
  }

  /**
   * Replace the toast handler.
   */
  public setToastHandler(
    handler: (type: "success" | "error", message: string) => void,
  ) {
    this.showToast = handler;
  }

  /**
   * Generic request entry point.
   *
   * The `request` key must exist in the Requests map.
   */
  async getRequest({
    body,
    params,
    id = "",
    request,
    suppressToast = false,
    pathExtension = "",
  }: {
    body?: object;
    suppressToast?: boolean;
    id?: number | string;
    params?: Record<string, any>;
    pathExtension?: string;
    request: keyof Requests;
  }) {
    const basePath = this.requests[request].url + id + pathExtension;

    switch (this.requests[request].method) {
      case "DELETE":
        return await this.delete(basePath, suppressToast);
      case "GET":
        return await this.get(basePath, params);
      case "PATCH":
        return await this.patch(basePath, body, suppressToast);
      case "POST":
        return await this.post(basePath, body, suppressToast);
      case "PUT":
        return await this.put(basePath, body, suppressToast);
      default:
        throw new Error(
          `Unsupported method ${this.requests[request].method as string}`,
        );
    }
  }

  // Convenience wrappers

  private delete = async (url: string, suppressToast?: boolean) => {
    return await this.sendRequest(url, "DELETE", suppressToast);
  };

  private get = async (url: string, params?: Record<string, any>) => {
    return await this.sendRequest(url, "GET", true, params);
  };

  private patch = async (url: string, body?: object, suppressToast?: boolean) => {
    return await this.sendRequest(
      url,
      "PATCH",
      suppressToast,
      undefined,
      body,
    );
  };

  private post = async (url: string, body?: object, suppressToast?: boolean) => {
    return await this.sendRequest(
      url,
      "POST",
      suppressToast,
      undefined,
      body,
    );
  };

  private put = async (url: string, body?: object, suppressToast?: boolean) => {
    return await this.sendRequest(url, "PUT", suppressToast, undefined, body);
  };

  // Low-level request handler

  private sendRequest = async (
    url: string,
    method: AppOperationRequest["method"],
    suppressToast = false,
    params?: Record<string, any>,
    body?: object,
  ) => {
    if (!this.baseUrl) {
      const errorMsg =
        "API base URL is not configured. Please set the baseUrl when constructing AppOperation.";
      if (!suppressToast) {
        this.showToast?.("error", "API configuration error");
      }
      return {
        status: 500,
        message: errorMsg,
      };
    }

    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    // Static headers (e.g. System-Key, app version)
    Object.entries(this.staticHeaders).forEach(([key, value]) => {
      headers.append(key, value);
    });
    // Dynamic headers (e.g. token, language, currency, branch, country)
    const dynamicHeaders = this.getDynamicHeaders?.() ?? {};
    Object.entries(dynamicHeaders).forEach(([key, value]) => {
      headers.append(key, value);
    });

    let parsedParams = "";

    const options: {
      body?: FormData | string;
      headers: Headers;
      method: string;
    } = {
      method,
      headers,
      body: undefined,
    };

    if (body) {
      if (body instanceof FormData) {
        headers.delete("Content-Type");
        headers.append("Content-Type", "multipart/form-data");
        options.body = body;
      } else {
        options.body = JSON.stringify(body);
      }
    }

    if (params) {
      Object.keys(params)
        .filter((key) => params[key] !== undefined && params[key] !== null)
        .forEach((key, i) => {
          if (i === 0) {
            parsedParams += `?${key}=${params[key]}`;
          } else {
            parsedParams += `&${key}=${params[key]}`;
          }
        });
    }

    try {
      const fullUrl = `${this.baseUrl}${url}${parsedParams}`;

      const response = await fetch(fullUrl, options);

      const data = await response.json();

      if (!suppressToast) {
        if (data.status === 200 || data.status === 201) {
          if (data?.message) {
            this.showToast?.("success", data.message);
          }
        }
      }

      if (data.status === 422 && !suppressToast) {
        const message = data?.errors
          ? data.errors[Object.keys(data.errors)[0]][0]
          : data?.message;
        if (message) {
          this.showToast?.("error", message);
        }
      } else if (data.status === 400 && !suppressToast && data?.message) {
        this.showToast?.("error", data.message);
      } else if (data.status === 500 && !suppressToast && data?.message) {
        this.showToast?.("error", data.message);
      }

      return data;
    } catch (_error: any) {
      const errorMessage = _error?.message || "Unknown error";

      let userMessage = "Something went wrong";
      if (
        errorMessage.includes("Network request failed") ||
        errorMessage.includes("Failed to fetch")
      ) {
        userMessage = "Network error. Please check your connection.";
      } else if (errorMessage.includes("JSON")) {
        userMessage = "Invalid response from server";
      }

      if (!suppressToast) {
        this.showToast?.("error", userMessage);
      }

      return {
        status: 500,
        message: userMessage,
        error: errorMessage,
      };
    }
  };
}

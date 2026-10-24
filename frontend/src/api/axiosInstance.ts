import axios, { type InternalAxiosRequestConfig } from 'axios';

const getCookie = (name: string): string | null => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() ?? null;
  return null;
};

let url = 'http://localhost:8080/api';
if (import.meta.env.VITE_API_BASE_URL) {
  url = import.meta.env.VITE_API_BASE_URL as string;
}

const api = axios.create({
  baseURL: url,
  withCredentials: true,
});

api.interceptors.request.use(config => {
  const method = config.method?.toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH') {
    const csrfToken = getCookie('XSRF-TOKEN');
    if (csrfToken) {
      config.headers['X-XSRF-TOKEN'] = csrfToken;
    }
  }
  return config;
});

let isRefreshing = false;
let failedQueue: { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }[] = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

interface RetryableAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  response => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const originalRequest = error.config as RetryableAxiosRequestConfig | undefined;

      if (!originalRequest) {
        return Promise.reject(error);
      }

      if (originalRequest.url === '/auth/login' || originalRequest.url === '/auth/refresh') {
        return Promise.reject(error);
      }

      const status = error.response?.status;
      if ((status === 401 || status === 403) && !originalRequest._retry) {
        if (isRefreshing) {
          return new Promise(function (resolve, reject) {
            failedQueue.push({ resolve, reject });
          })
            .then(async () => await api(originalRequest))
            .catch((err: unknown) =>
              Promise.reject(err instanceof Error ? err : new Error(String(err)))
            );
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          await api.post('/auth/refresh');
          processQueue(null);
          return await api(originalRequest);
        } catch (refreshError: unknown) {
          processQueue(
            refreshError instanceof Error ? refreshError : new Error(String(refreshError))
          );
          window.dispatchEvent(new Event('auth-error'));
          return await Promise.reject(
            refreshError instanceof Error ? refreshError : new Error(String(refreshError))
          );
        } finally {
          isRefreshing = false;
        }
      }
    }

    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
);

export default api;
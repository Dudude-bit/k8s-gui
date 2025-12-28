import Axios, { AxiosRequestConfig } from 'axios';

export const AXIOS_INSTANCE = Axios.create({ baseURL: '/api/v1' }); // In dev, Vite proxy handles /api/v1 -> localhost:8081

export const customInstance = <T>(
    config: AxiosRequestConfig,
    options?: AxiosRequestConfig
): Promise<T> => {
    const source = Axios.CancelToken.source();
    const promise = AXIOS_INSTANCE({
        ...config,
        ...options,
        cancelToken: source.token,
    }).then(({ data }) => data);

    // @ts-ignore
    promise.cancel = () => {
        source.cancel('Query was cancelled');
    };

    return promise;
};

// Add interceptor for auth token
AXIOS_INSTANCE.interceptors.request.use(async (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Add interceptor for response errors (e.g. 401 refresh)
AXIOS_INSTANCE.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        // Prevent infinite loop
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                const refreshToken = localStorage.getItem('refresh_token');
                if (refreshToken) {
                    // Manual refresh request to avoid circular dependency if generated client uses this instance
                    // Or use a separate instance for refresh
                    const { data } = await Axios.post('/api/v1/auth/refresh', { refresh_token: refreshToken });
                    localStorage.setItem('access_token', data.accessToken);
                    localStorage.setItem('refresh_token', data.refreshToken);

                    originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
                    return AXIOS_INSTANCE(originalRequest);
                }
            } catch (err) {
                // Refresh failed, logout
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

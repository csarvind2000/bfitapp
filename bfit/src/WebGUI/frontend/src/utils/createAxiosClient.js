import axios from "axios";

export const createAxiosClient = ({ config, getAuthToken }) => {
  const client = axios.create(config);
  client.interceptors.request.use(
    (config) => {
      if (config.useAuthorization) {
        const token = getAuthToken();
        if (token) {
          config.headers.Authorization = `Token ${token}`;
        }
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        window.localStorage.removeItem("session");
        window.dispatchEvent(
          new CustomEvent("bfit:auth-invalid", {
            detail: error.response?.data,
          })
        );
      }
      return Promise.reject(error);
    }
  );
  return client;
};

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
  return client;
};

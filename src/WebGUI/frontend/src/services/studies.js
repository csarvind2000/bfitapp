import { createAxiosClient } from "../utils/createAxiosClient";

const axiosClient = createAxiosClient({
  config: {
    baseURL: "/api/studies",
  },
  getAuthToken: () => {
    const session = window.localStorage.getItem("session");
    if (session) {
      const sessionObj = JSON.parse(session);
      return sessionObj.token;
    }
    return null;
  },
});

const getAll = async () => {
  const response = await axiosClient.get("/", { useAuthorization: true });
  return response.data;
};

const getAllFromPACS = async () => {
  const response = await axiosClient.get("/pacs/", { useAuthorization: true });
  return response.data;
};

const getInstances = async (studyId, seriesId, page = null) => {
  const queryParams = page ? { page } : {};
  const response = await axiosClient.get(
    `/${studyId}/series/${seriesId}/instances/`,
    {
      params: queryParams,
      useAuthorization: true,
    }
  );
  return response.data;
};

const create = async (formData) => {
  const response = await axiosClient.post("/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    useAuthorization: true,
  });
  return response.data;
};

const createFromPACS = async (seriesIds) => {
  const queryParams = { series: seriesIds };
  const response = await axiosClient.post("/import-pacs/", null, {
    params: queryParams,
    useAuthorization: true,
    paramsSerializer: {
      indexes: null,
    }, // needed for sending multiple request params with the same key
  });
  return response.data;
};

const remove = async (studyId) => {
  const response = await axiosClient.delete(`/${studyId}/`, {
    useAuthorization: true,
  });
  return response.data;
};

const removeSeries = async (studyId, seriesId) => {
  const response = await axiosClient.delete(`${studyId}/series/${seriesId}/`, {
    useAuthorization: true,
  });
  return response.data;
};

const generateReport = async (studyId, seriesIds) => {
  const queryParams = { series: seriesIds };
  const response = await axiosClient.post(`${studyId}/generate-report/`, null, {
    params: queryParams,
    useAuthorization: true,
    paramsSerializer: {
      indexes: null,
    }, // needed for sending multiple request params with the same key
  });
  return response.data;
};

const getSeriesMeta = async (studyId, seriesId) => {
  const response = await axiosClient.get(
    `${studyId}/series/${seriesId}/meta/`,
    { useAuthorization: true }
  );
  return response.data;
};

export default {
  getAll,
  getAllFromPACS,
  getInstances,
  create,
  createFromPACS,
  remove,
  removeSeries,
  generateReport,
  getSeriesMeta
};

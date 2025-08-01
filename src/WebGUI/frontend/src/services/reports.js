import { createAxiosClient } from "../utils/createAxiosClient";

const axiosClient = createAxiosClient({
  config: {
    baseURL: "/api/reports",
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

const getAll = async (studyId) => {
  const queryParams = {};
  if (studyId) {
    queryParams.study_id = studyId;
  }
  const response = await axiosClient.get("/", {
    params: queryParams,
    useAuthorization: true,
  });
  return response.data;
};

const getDetail = async (reportId) => {
  const response = await axiosClient.get(`/${reportId}/`, {
    useAuthorization: true,
  });
  return response.data;
};

const download = async (reportId) => {
  const response = await axiosClient.get(`/${reportId}/download/`, {
    useAuthorization: true,
    responseType: "blob",
  });
  return response.data;
};

const remove = async (reportId) => {
  const response = await axiosClient.delete(`/${reportId}/`, {
    useAuthorization: true,
  });
  return response.data;
};

export default { getAll, getDetail, download, remove };

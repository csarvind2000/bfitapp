import { createAxiosClient } from "../utils/createAxiosClient";

const axiosClient = createAxiosClient({
  config: {
    baseURL: "/api",
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

const getJobStatus = async (jobId) => {
  const response = await axiosClient.get("/job-status/", {
    params: { job_id: jobId },
    useAuthorization: true,
  });
  return response.data;
};

export default {
  getJobStatus,
};

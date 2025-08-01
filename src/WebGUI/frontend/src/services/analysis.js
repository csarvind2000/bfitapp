import { createAxiosClient } from "../utils/createAxiosClient";

const axiosClient = createAxiosClient({
  config: {
    baseURL: "/api/analysis",
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

const getStatus = async (seriesId) => {
  const response = await axiosClient.get("/", {
    params: { series_id: seriesId },
    useAuthorization: true,
  });
  return response.data;
};

const getCompleted = async (studyId, seriesId) => {
  const queryParams = {};
  if (studyId) {
    queryParams.study_id = studyId;
  }
  if (seriesId) {
    queryParams.series_id = seriesId;
  }
  const response = await axiosClient.get("/completed/", {
    params: queryParams,
    useAuthorization: true,
  });
  return response.data;
};

const getBounded = async (formData) => {
  const response = await axiosClient.post("/bound_mask/", formData, {
    useAuthorization: true,
  });
  return response.data;
};

const getCombinedMask = async (analysisId, segmentations) => {
  console.log(segmentations);
  const queryParams = {
    analysis_id: analysisId,
    segmentations: JSON.stringify(segmentations),
  };

  const response = await axiosClient.get("/combine_masks/", {
    params: queryParams,
    useAuthorization: true,
  });
  return response.data;
};

const getOne = async (analysisId) => {
  const response = await axiosClient.get(`/${analysisId}/`, {
    useAuthorization: true,
  });
  return response.data;
};

const getDetail = async (analysisId, detailTypes, detailValues = {}) => {
  const allowedDetailTypes = ["predictions", "segmentations", "artifacts"];
  const queryParams = {};
  for (const t of detailTypes) {
    if (allowedDetailTypes.includes(t)) {
      queryParams[t] = detailValues[t] || true;
    } else {
      throw new Error(`Invalid detail type was passed: ${t}`);
    }
  }
  const response = await axiosClient.get(`/${analysisId}/`, {
    params: queryParams,
    useAuthorization: true,
    paramsSerializer: {
      indexes: null,
    }, // needed for sending multiple request params with the same key
  });
  return response.data;
};

const create = async (seriesId) => {
  const response = await axiosClient.post("/", null, {
    params: { series_id: seriesId },
    useAuthorization: true,
  });
  return response.data;
};

const remove = async (analysisId) => {
  const response = await axiosClient.delete(`/${analysisId}/`, {
    useAuthorization: true,
  });
  return response.data;
};

const cancel = async (analysisId) => {
  const response = await axiosClient.post(`/${analysisId}/cancel/`, null, {
    useAuthorization: true,
  });
  return response.data;
};

const addSegmentation = async (analysisId, maskType, formData) => {
  const response = await axiosClient.post(
    `/${analysisId}/update-segmentation/`,
    formData,
    {
      params: { mask_type: maskType },
      headers: {
        "Content-Type": "multipart/form-data",
      },
      useAuthorization: true,
    }
  );
  return response.data;
};

const removeSegmentation = async (analysisId, maskType) => {
  const response = await axiosClient.delete(
    `/${analysisId}/update-segmentation/`,
    {
      params: { mask_type: maskType },
      useAuthorization: true,
    }
  );
  return response.data;
};

const updateSegmentationResult = async (
  analysisId,
  maskType,
  updateKey = null
) => {
  const response = await axiosClient.post(
    `/${analysisId}/update-segmentation-result/`,
    null,
    {
      params: { mask_type: maskType, update_key: updateKey },
      useAuthorization: true,
    }
  );
  return response.data;
};

const getTrimmedVolume = async (analysisId) => {
  const response = await axiosClient.get(`/${analysisId}/trim-volume/`, {
    useAuthorization: true,
  });
  return response.data;
};

const loadComment = async (analysisId) => {
  const queryParams = { analysis_id: analysisId };

  const response = await axiosClient.get("/load_comment/", {
    params: queryParams,
    useAuthorization: true,
  });

  return response.data;
};

const saveComment = async (formData) => {
  const response = await axiosClient.post("/save_comment/", formData, {
    useAuthorization: true,
  });

  return response.data;
};

const loadSummary = async (analysisId) => {
  const queryParams = { analysis_id: analysisId };

  const response = await axiosClient.get("/load_summary/", {
    params: queryParams,
    useAuthorization: true,
  });

  return response.data;
};

const saveSummary = async (formData) => {
  const response = await axiosClient.post("/save_summary/", formData, {
    useAuthorization: true,
  });

  return response.data;
};

const generateSummary = async (analysisId) => {
  const queryParams = { analysis_id: analysisId };

  const response = await axiosClient.get("/generate_summary/", {
    params: queryParams,
    useAuthorization: true,
  });

  return response.data;
};

const updatePredictionResult = async (analysisId, result) => {
  const response = await axiosClient.post(
    `/${analysisId}/update-prediction-result/`,
    { prediction_update: result },
    { useAuthorization: true }
  );

  return response.data;
};

export default {
  getStatus,
  getCompleted,
  getBounded,
  getCombinedMask,
  getOne,
  getDetail,
  loadComment,
  saveComment,
  loadSummary,
  saveSummary,
  generateSummary,
  create,
  remove,
  cancel,
  addSegmentation,
  removeSegmentation,
  updateSegmentationResult,
  updatePredictionResult,
  getTrimmedVolume,
};

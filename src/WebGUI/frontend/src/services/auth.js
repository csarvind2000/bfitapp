import { createAxiosClient } from "../utils/createAxiosClient"

const axiosClient = createAxiosClient({
  config: {
    baseURL: "/api/users",
  },
  getAuthToken: () => {
    const session = window.localStorage.getItem("session")
    if (session) {
      const sessionObj = JSON.parse(session)
      return sessionObj.token
    }
    return null
  },
})

const login = async (formData) => {
  const username = formData.get('username')
  const password = formData.get('password')
  const response = await axiosClient.post("/login/", { username, password })
  return response.data
}

const logout = async () => {
  const response = await axiosClient.post("/logout/", null, {
    useAuthorization: true,
  })
  return response.data
}

const register = async (formData) => {
  const username = formData.get('username')
  const password = formData.get('password')
  const response = await axiosClient.post("/", { username, password })
  return response.data
}

const verify = async (token) => {
  const response = await axiosClient.post("/verify/", { token })
  return response.data
}

export default { login, logout, register, verify }

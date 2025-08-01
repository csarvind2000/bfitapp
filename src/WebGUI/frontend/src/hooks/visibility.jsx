import React, { useState, useEffect, useContext } from "react"
/* Custom hook to monitor page visibility changes
 */

const PageVisibleContext = React.createContext()

export function useVisibilityChange() {
  const context = useContext(PageVisibleContext)
  return context
}

export function PageVisibilityProvider({ children }) {
  const [isVisible, setVisible] = useState(!document.hidden)

  useEffect(() => {
    const handleVisibilityChange = () => {
      setVisible(!document.hidden)
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  return (
    <PageVisibleContext.Provider value={isVisible}>
      {children}
    </PageVisibleContext.Provider>
  )
}

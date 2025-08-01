import { useState, useEffect, useRef } from "react"
/* Custom setInterval hook to properly update 
React component state on an interval with option
to pause the interval
 */

export function useInterval(callback, delay) {
  const savedCallback = useRef()

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Set up the interval
  useEffect(() => {
    function tick() {
      savedCallback.current()
    }
    if (delay !== null) {
      tick()
      let id = setInterval(tick, delay)
      return () => clearInterval(id)
    }
  }, [delay])
}

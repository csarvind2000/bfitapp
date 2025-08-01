import { LRUCache } from "lru-cache";
import { useRef } from "react";

export function useLRUCache(capacity) {
  const cacheRef = useRef(new LRUCache({ max: capacity }));

  return {
    get: (key) => cacheRef.current.get(key),
    set: (key, val) => cacheRef.current.set(key, val),
    clear: () => cacheRef.current.clear(),
  };
}

'use client'

import { useCallback, useEffect, useState } from 'react'

export function useWidth<T extends HTMLElement>(fallback: number): [(node: T | null) => void, number] {
  const [node, setNode] = useState<T | null>(null)
  const [width, setWidth] = useState(fallback)
  const ref = useCallback((el: T | null) => setNode(el), [])

  useEffect(() => {
    if (!node) return
    const update = () => setWidth(Math.max(1, Math.round(node.getBoundingClientRect().width)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])

  return [ref, width]
}

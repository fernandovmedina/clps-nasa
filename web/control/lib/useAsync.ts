'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; error: unknown }

interface Slot<T> {
  key: string | null
  attempt: number
  state: AsyncState<T>
}

export function useAsync<T>(key: string | null, load: () => Promise<T>): [AsyncState<T>, () => void] {
  const [attempt, setAttempt] = useState(0)
  const [slot, setSlot] = useState<Slot<T>>({ key: null, attempt: 0, state: { status: 'loading' } })
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    if (key === null) return
    let live = true
    loadRef.current().then(
      (value) => live && setSlot({ key, attempt, state: { status: 'ready', value } }),
      (error: unknown) => live && setSlot({ key, attempt, state: { status: 'error', error } }),
    )
    return () => {
      live = false
    }
  }, [key, attempt])

  const retry = useCallback(() => {
    setSlot((s) => ({ ...s, state: { status: 'loading' } }))
    setAttempt((n) => n + 1)
  }, [])

  const current: AsyncState<T> = slot.key === key && slot.attempt === attempt ? slot.state : { status: 'loading' }
  return [current, retry]
}

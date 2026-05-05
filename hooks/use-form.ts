'use client'

import { useState } from 'react'

interface UseFormOptions<T> {
  initialValues: T
  onSubmit: (values: T) => Promise<{ error?: string }>
  onSuccess?: () => void
}

export function useForm<T extends Record<string, unknown>>({
  initialValues,
  onSubmit,
  onSuccess,
}: UseFormOptions<T>) {
  const [values,  setValues]  = useState<T>(initialValues)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function set<K extends keyof T>(field: K, value: T[K]) {
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  function setNumber<K extends keyof T>(field: K, raw: string) {
    const num = raw === '' ? undefined : Number(raw)
    setValues((prev) => ({ ...prev, [field]: num as T[K] }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await onSubmit(values)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      onSuccess?.()
    }
  }

  function reset() {
    setValues(initialValues)
    setError(null)
  }

  return { values, set, setNumber, loading, error, handleSubmit, reset }
}

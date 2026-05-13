import { useRef, useState } from 'react'
import { client } from '../api/client.ts'
import type { ModelState, VarInfo, VarMeta } from '../interfaces/index.ts'
import { parseIndices, getErrorMessage } from '../utils/index.ts'

interface Params {
  model: ModelState | null
  startOp: (key: string) => void
  endOp: (key: string) => void
  setError: (msg: string | null) => void
}

export function useModelVars({ model, startOp, endOp, setError }: Params) {
  const [varInfo, setVarInfo] = useState<Record<string, VarInfo>>({})
  const [varMeta, setVarMeta] = useState<Record<string, VarMeta>>({})
  const [selectedInputVar, setSelectedInputVar] = useState('')
  const [selectedOutputVar, setSelectedOutputVar] = useState('')
  const [setValueInputs, setSetValueInputs] = useState<Record<string, string>>({})
  const [inputIndicesInput, setInputIndicesInput] = useState('')
  const [outputIndicesInput, setOutputIndicesInput] = useState('')
  const [inputVarSizes, setInputVarSizes] = useState<Record<string, number>>({})
  const [validPrefills, setValidPrefills] = useState<Set<string>>(new Set())

  const selectedInputVarRef = useRef(selectedInputVar)
  selectedInputVarRef.current = selectedInputVar

  async function fetchVarMeta(name: string) {
    if (!name || varMeta[name] !== undefined) return
    try {
      const [unitsRes, typeRes, gridRes] = await Promise.all([
        client.GET('/get_var_units/{name}', { params: { path: { name } } }),
        client.GET('/get_var_type/{name}', { params: { path: { name } } }),
        client.GET('/get_var_grid/{name}', { params: { path: { name } } }),
      ])
      const grid = gridRes.data ?? null
      let gridType: string | null = null
      let size: number | null = null
      if (grid != null && grid >= 0) {
        const [gridTypeRes, sizeRes] = await Promise.all([
          client.GET('/get_grid_type/{grid}', { params: { path: { grid } } }),
          client.GET('/get_grid_size/{grid}', { params: { path: { grid } } }),
        ])
        gridType = gridTypeRes.data?.type ?? null
        size = sizeRes.data ?? null
      }
      setVarMeta(prev => ({
        ...prev,
        [name]: {
          units: unitsRes.data?.units ?? '',
          vartype: typeRes.data?.type ?? '',
          grid, gridType, size,
        },
      }))
    } catch { /* non-critical */ }
  }

  async function getValue(name: string, indicesStr?: string) {
    const indices = indicesStr ? parseIndices(indicesStr) : null
    setVarInfo(prev => ({ ...prev, [name]: { value: prev[name]?.value ?? null, loading: true } }))
    try {
      if (indices && indices.length > 0) {
        const { data, error: err } = await client.POST('/get_value_at_indices/{name}', {
          params: { path: { name } },
          body: indices,
        })
        if (err) setError(getErrorMessage(err))
        setVarInfo(prev => ({ ...prev, [name]: { value: data ?? null, loading: false } }))
      } else {
        const { data, error: err } = await client.GET('/get_value/{name}', {
          params: { path: { name } },
        })
        if (err) setError(getErrorMessage(err))
        setVarInfo(prev => ({ ...prev, [name]: { value: data ?? null, loading: false } }))
      }
    } catch (e) {
      setError(getErrorMessage(e))
      setVarInfo(prev => ({ ...prev, [name]: { ...prev[name], loading: false } }))
    }
  }

  async function setValue(name: string, indicesStr?: string) {
    const raw = setValueInputs[name] ?? ''
    const values = raw.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
    if (!values.length) { setError('Enter comma-separated numbers'); return }
    const indices = indicesStr ? parseIndices(indicesStr) : null
    if (indices && indices.length > 0) {
      if (indices.length !== values.length) {
        setError(`Number of indices (${indices.length}) must match number of values (${values.length})`)
        return
      }
      const varSize = inputVarSizes[name]
      if (varSize !== undefined && indices.some(i => i >= varSize)) {
        setError(`All indices must be smaller than variable size (${varSize})`)
        return
      }
    }
    setError(null)
    startOp(`set_${name}`)
    try {
      if (indices && indices.length > 0) {
        const { error: err } = await client.POST('/set_value_at_indices/{name}', {
          params: { path: { name } },
          body: { indices, values },
        })
        if (err) { setError(getErrorMessage(err)); return }
      } else {
        const { error: err } = await client.POST('/set_value/{name}', {
          params: { path: { name } },
          body: values,
        })
        if (err) { setError(getErrorMessage(err)); return }
      }
      await getValue(name)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      endOp(`set_${name}`)
    }
  }

  async function prefillInputVar(name: string) {
    if (!name || !model?.outputVars.includes(name)) return
    try {
      const { data } = await client.GET('/get_value/{name}', { params: { path: { name } } })
      if (data != null) {
        const nums = Array.isArray(data) ? data : [data as unknown as number]
        setSetValueInputs(prev => ({ ...prev, [name]: nums.join(', ') }))
      }
    } catch { /* ignore */ }
  }

  async function selectInputVar(name: string) {
    setSelectedInputVar(name)
    setInputIndicesInput('')
    fetchVarMeta(name)
    if (!name || validPrefills.has(name)) return
    try {
      let size = inputVarSizes[name]
      if (size === undefined) {
        const { data: grid } = await client.GET('/get_var_grid/{name}', {
          params: { path: { name } },
        })
        if (grid == null) return
        const { data: fetched } = await client.GET('/get_grid_size/{grid}', {
          params: { path: { grid } },
        })
        if (fetched == null) return
        size = fetched
        setInputVarSizes(prev => ({ ...prev, [name]: size! }))
      }
      let prefill = Array(size).fill('0').join(', ')
      if (model?.outputVars.includes(name)) {
        const { data } = await client.GET('/get_value/{name}', { params: { path: { name } } })
        if (data != null) {
          const nums = Array.isArray(data) ? data : [data as unknown as number]
          prefill = nums.join(', ')
        }
      }
      setValidPrefills(prev => new Set([...prev, name]))
      setSetValueInputs(prev => ({ ...prev, [name]: prefill }))
    } catch { /* ignore */ }
  }

  async function selectOutputVar(name: string) {
    setSelectedOutputVar(name)
    setOutputIndicesInput('')
    fetchVarMeta(name)
    if (name) await getValue(name)
  }

  return {
    varInfo, setVarInfo,
    varMeta,
    selectedInputVar, selectedInputVarRef,
    selectedOutputVar,
    setValueInputs,
    inputIndicesInput, setInputIndicesInput,
    outputIndicesInput, setOutputIndicesInput,
    inputVarSizes,
    setValidPrefills,
    fetchVarMeta,
    getValue, setValue,
    prefillInputVar,
    selectInputVar, selectOutputVar,
    setValueInput: (name: string, v: string) =>
      setSetValueInputs(prev => ({ ...prev, [name]: v })),
  }
}

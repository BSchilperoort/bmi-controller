import { useEffect, useState } from 'react'
import { client, DEFAULT_SERVER_URL } from '../api/client.ts'
import type { Phase, ModelState } from '../interfaces/index.ts'
import { getErrorMessage } from '../utils/index.ts'

export function useConnection() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [serverUrl, setServerUrlState] = useState(
    () => localStorage.getItem('bmi-server-url') ?? DEFAULT_SERVER_URL,
  )
  const [configFile, setConfigFile] = useState('experiment_leakybucket_config.json')
  const [model, setModel] = useState<ModelState | null>(null)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ops, setOps] = useState<Record<string, boolean>>({})
  const [availableGrids, setAvailableGrids] = useState<Map<number, string>>(new Map())
  const [gridVarMap, setGridVarMap] = useState<Map<number, string[]>>(new Map())

  useEffect(() => {
    if (phase === 'idle') return
    const check = async () => {
      try {
        const { data } = await client.GET('/get_component_name')
        setConnected(data != null)
      } catch {
        setConnected(false)
      }
    }
    check()
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [phase])

  function startOp(key: string) { setOps(p => ({ ...p, [key]: true })) }
  function endOp(key: string) { setOps(p => ({ ...p, [key]: false })) }

  function handleServerUrlChange(url: string) {
    setServerUrlState(url)
    localStorage.setItem('bmi-server-url', url)
  }

  async function refreshCurrentTime(): Promise<number | null> {
    const { data } = await client.GET('/get_current_time')
    if (data !== undefined) {
      setModel(prev => prev ? { ...prev, currentTime: data } : prev)
      return data
    }
    return null
  }

  async function initialize() {
    await fetch('/__bmi_proxy__', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: serverUrl }),
    }).catch(() => {})
    setError(null)
    startOp('init')
    try {
      const { error: err } = await client.POST('/initialize', {
        body: { config_file: configFile },
      })
      if (err) { setError(getErrorMessage(err)); return }

      const [nameRes, inputRes, outputRes, curRes, startRes, endRes, stepRes, unitsRes] =
        await Promise.all([
          client.GET('/get_component_name'),
          client.GET('/get_input_var_names'),
          client.GET('/get_output_var_names'),
          client.GET('/get_current_time'),
          client.GET('/get_start_time'),
          client.GET('/get_end_time'),
          client.GET('/get_time_step'),
          client.GET('/get_time_units'),
        ])

      const inputVarNames = Array.isArray(inputRes.data)
        ? inputRes.data
        : inputRes.data != null ? [inputRes.data as unknown as string] : []
      const outputVarNames = Array.isArray(outputRes.data)
        ? outputRes.data
        : outputRes.data != null ? [outputRes.data as unknown as string] : []

      setModel({
        componentName: nameRes.data?.name ?? 'Unknown',
        inputVars: inputVarNames,
        outputVars: outputVarNames,
        currentTime: curRes.data ?? 0,
        startTime: startRes.data ?? 0,
        endTime: endRes.data ?? 0,
        timeStep: stepRes.data ?? 0,
        timeUnits: unitsRes.data?.units ?? '',
      })

      const allVarNames = [...new Set([...inputVarNames, ...outputVarNames])]
      const gridIdResults = await Promise.all(
        allVarNames.map(name =>
          client.GET('/get_var_grid/{name}', { params: { path: { name } } }),
        ),
      )
      const varToGrid = new Map<string, number>()
      allVarNames.forEach((name, i) => {
        const id = gridIdResults[i].data
        if (id != null && id >= 0) varToGrid.set(name, id)
      })
      const uniqueGridIds = [...new Set(varToGrid.values())]
      if (uniqueGridIds.length > 0) {
        const gridTypeResults = await Promise.all(
          uniqueGridIds.map(grid =>
            client.GET('/get_grid_type/{grid}', { params: { path: { grid } } }),
          ),
        )
        const gridsMap = new Map<number, string>()
        uniqueGridIds.forEach((id, i) => {
          gridsMap.set(id, gridTypeResults[i].data?.type ?? 'unknown')
        })
        setAvailableGrids(gridsMap)

        const varsByGrid = new Map<number, string[]>()
        outputVarNames.forEach(name => {
          const gid = varToGrid.get(name)
          if (gid !== undefined) varsByGrid.set(gid, [...(varsByGrid.get(gid) ?? []), name])
        })
        setGridVarMap(varsByGrid)
      }

      setPhase('ready')
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      endOp('init')
    }
  }

  async function finalize() {
    setError(null)
    startOp('finalize')
    try {
      const { error: err } = await client.DELETE('/finalize')
      if (err) { setError(getErrorMessage(err)); return }
      setPhase('finalized')
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      endOp('finalize')
    }
  }

  return {
    phase, model, connected, error, setError, ops,
    serverUrl, configFile, setConfigFile,
    availableGrids, gridVarMap,
    handleServerUrlChange,
    initialize, finalize,
    refreshCurrentTime,
    startOp, endOp,
  }
}

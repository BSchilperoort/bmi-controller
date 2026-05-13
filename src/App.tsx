import { useEffect, useRef, useState } from 'react'
import { client, DEFAULT_SERVER_URL } from './api/client.ts'
import { formatCFDate, parseCFTimeUnits } from './utils/cfTime.ts'
import { type GridData } from './components/GridView.tsx'
import type { Phase, VarMeta, VarInfo, ModelState, ChartPoint } from './interfaces/index.ts'
import { parseIndices, getErrorMessage } from './utils/index.ts'
import { TimeSection } from './components/TimeSection.tsx'
import { VarsSection } from './components/VarsSection.tsx'
import { PlotSection } from './components/PlotSection.tsx'
import { GridSection } from './components/GridSection.tsx'
import './App.css'

function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [serverUrl, setServerUrlState] = useState(() => localStorage.getItem('bmi-server-url') ?? DEFAULT_SERVER_URL)
  const [configFile, setConfigFile] = useState('experiment_leakybucket_config.json')
  const [model, setModel] = useState<ModelState | null>(null)
  const [varInfo, setVarInfo] = useState<Record<string, VarInfo>>({})
  const [updateUntilTime, setUpdateUntilTime] = useState('')
  const [ops, setOps] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [setValueInputs, setSetValueInputs] = useState<Record<string, string>>({})
  const [selectedInputVar, setSelectedInputVar] = useState('')
  const [selectedOutputVar, setSelectedOutputVar] = useState('')
  const [inputVarSizes, setInputVarSizes] = useState<Record<string, number>>({})
  const [validPrefills, setValidPrefills] = useState<Set<string>>(new Set())
  const [varMeta, setVarMeta] = useState<Record<string, VarMeta>>({})
  const [outputIndicesInput, setOutputIndicesInput] = useState('')
  const [inputIndicesInput, setInputIndicesInput] = useState('')
  const [chartVar, setChartVar] = useState('')
  const [chartIndex, setChartIndex] = useState(0)
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [connected, setConnected] = useState<boolean | null>(null)
  const [playing, setPlaying] = useState(false)
  const playingRef = useRef(false)
  const [availableGrids, setAvailableGrids] = useState<Map<number, string>>(new Map())
  const [gridVarMap, setGridVarMap] = useState<Map<number, string[]>>(new Map())
  const [selectedGridId, setSelectedGridId] = useState<number | null>(null)
  const [gridData, setGridData] = useState<GridData | null>(null)
  const [loadingGrid, setLoadingGrid] = useState(false)
  const [gridVar, setGridVar] = useState('')
  const [gridVarValues, setGridVarValues] = useState<number[] | null>(null)
  const [gridShowFaces, setGridShowFaces] = useState(true)
  const [gridShowEdges, setGridShowEdges] = useState(true)
  const [gridShowNodes, setGridShowNodes] = useState(true)

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
        [name]: { units: unitsRes.data?.units ?? '', vartype: typeRes.data?.type ?? '', grid, gridType, size },
      }))
    } catch { /* non-critical */ }
  }

  async function refreshCurrentTime(): Promise<number | null> {
    const { data } = await client.GET('/get_current_time')
    if (data !== undefined) {
      setModel(prev => prev ? { ...prev, currentTime: data } : prev)
      return data
    }
    return null
  }

  async function recordChartPoint(time: number, varName: string) {
    if (!varName) return
    try {
      const { data } = await client.GET('/get_value/{name}', {
        params: { path: { name: varName } },
      })
      if (data != null) {
        const values = Array.isArray(data) ? data : [data as unknown as number]
        setChartData(prev => [...prev, { time, values }])
        setVarInfo(prev => ({ ...prev, [varName]: { value: values, loading: false } }))
      }
    } catch {
      // non-critical
    }
  }

  async function play() {
    if (!model) return
    const endTime = model.endTime
    setPlaying(true)
    playingRef.current = true
    setError(null)
    try {
      while (playingRef.current) {
        const { error: err } = await client.POST('/update')
        if (err) { setError(getErrorMessage(err)); break }
        if (!playingRef.current) break
        const newTime = await refreshCurrentTime()
        setValidPrefills(new Set())
        await prefillInputVar(selectedInputVar)
        await selectGridVar(gridVar, true)
        if (newTime === null || !playingRef.current) break
        await recordChartPoint(newTime, chartVar)
        if (newTime >= endTime) break
      }
    } catch (e) {
      setError(getErrorMessage(e))
    }
    setPlaying(false)
    playingRef.current = false
  }

  function pause() {
    playingRef.current = false
    setPlaying(false)
  }

  function handleServerUrlChange(url: string) {
    setServerUrlState(url)
    localStorage.setItem('bmi-server-url', url)
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

      const inputVarNames = Array.isArray(inputRes.data) ? inputRes.data : inputRes.data != null ? [inputRes.data as unknown as string] : []
      const outputVarNames = Array.isArray(outputRes.data) ? outputRes.data : outputRes.data != null ? [outputRes.data as unknown as string] : []
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
        allVarNames.map(name => client.GET('/get_var_grid/{name}', { params: { path: { name } } }))
      )
      const varToGrid = new Map<string, number>()
      allVarNames.forEach((name, i) => {
        const id = gridIdResults[i].data
        if (id != null && id >= 0) varToGrid.set(name, id)
      })
      const uniqueGridIds = [...new Set(varToGrid.values())]
      if (uniqueGridIds.length > 0) {
        const gridTypeResults = await Promise.all(
          uniqueGridIds.map(grid => client.GET('/get_grid_type/{grid}', { params: { path: { grid } } }))
        )
        const gridsMap = new Map<number, string>()
        uniqueGridIds.forEach((id, i) => { gridsMap.set(id, gridTypeResults[i].data?.type ?? 'unknown') })
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

  async function update() {
    setError(null)
    startOp('update')
    try {
      const { error: err } = await client.POST('/update')
      if (err) { setError(getErrorMessage(err)); return }
      const newTime = await refreshCurrentTime()
      setValidPrefills(new Set())
      await prefillInputVar(selectedInputVar)
      await selectGridVar(gridVar, true)
      if (newTime !== null) await recordChartPoint(newTime, chartVar)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      endOp('update')
    }
  }

  async function updateUntil() {
    const t = parseFloat(updateUntilTime)
    if (isNaN(t)) { setError('Enter a valid time value'); return }
    setError(null)
    startOp('updateUntil')
    try {
      const { error: err } = await client.POST('/update_until', { body: t })
      if (err) { setError(getErrorMessage(err)); return }
      const newTime = await refreshCurrentTime()
      setValidPrefills(new Set())
      await prefillInputVar(selectedInputVar)
      await selectGridVar(gridVar, true)
      if (newTime !== null) await recordChartPoint(newTime, chartVar)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      endOp('updateUntil')
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

  async function getValue(name: string, indicesStr?: string) {
    const indices = indicesStr ? parseIndices(indicesStr) : null
    setVarInfo(prev => ({
      ...prev,
      [name]: { value: prev[name]?.value ?? null, loading: true },
    }))
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
        setError(`Number of indices (${indices.length}) must match number of values (${values.length})`); return
      }
      const varSize = inputVarSizes[name]
      if (varSize !== undefined && indices.some(i => i >= varSize)) {
        setError(`All indices must be smaller than variable size (${varSize})`); return
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
      const { data: current } = await client.GET('/get_value/{name}', {
        params: { path: { name } },
      })
      if (current != null) {
        const nums = Array.isArray(current) ? current : [current as unknown as number]
        setSetValueInputs(prev => ({ ...prev, [name]: nums.join(', ') }))
      }
    } catch {
      // ignore
    }
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
        const { data: current } = await client.GET('/get_value/{name}', {
          params: { path: { name } },
        })
        if (current != null) {
          const nums = Array.isArray(current) ? current : [current as unknown as number]
          prefill = nums.join(', ')
        }
      }
      setValidPrefills(prev => new Set([...prev, name]))
      setSetValueInputs(prev => ({ ...prev, [name]: prefill }))
    } catch {
      // ignore
    }
  }

  async function selectOutputVar(name: string) {
    setSelectedOutputVar(name)
    setOutputIndicesInput('')
    fetchVarMeta(name)
    if (name) await getValue(name)
  }

  async function handleChartVarChange(name: string) {
    setChartVar(name)
    setChartIndex(0)
    setChartData([])
    fetchVarMeta(name)
    if (!name || !model) return
    try {
      const { data } = await client.GET('/get_value/{name}', {
        params: { path: { name } },
      })
      if (data != null) {
        const values = Array.isArray(data) ? data : [data as unknown as number]
        setChartData([{ time: model.currentTime, values }])
        setVarInfo(prev => ({ ...prev, [name]: { value: values, loading: false } }))
      }
    } catch {
      // ignore
    }
  }

  async function selectGridVar(name: string, keepExisting = false) {
    setGridVar(name)
    if (!keepExisting) setGridVarValues(null)
    if (!name) return
    try {
      const { data } = await client.GET('/get_value/{name}', { params: { path: { name } } })
      if (data != null) {
        setGridVarValues(Array.isArray(data) ? data : [data as unknown as number])
      }
    } catch { /* non-critical */ }
  }

  async function selectGrid(id: number | null) {
    setSelectedGridId(id)
    setGridData(null)
    setGridVar('')
    setGridVarValues(null)
    if (id === null) return
    const typeStr = availableGrids.get(id) ?? 'unknown'
    setLoadingGrid(true)
    try {
      const rankRes = await client.GET('/get_grid_rank/{grid}', { params: { path: { grid: id } } })
      const rank = rankRes.data ?? 0

      if (typeStr === 'uniform_rectilinear') {
        const [shapeRes, spacingRes, originRes] = await Promise.all([
          client.GET('/get_grid_shape/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_spacing/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_origin/{grid}', { params: { path: { grid: id } } }),
        ])
        setGridData({ type: 'uniform_rectilinear', rank, shape: shapeRes.data ?? [], spacing: spacingRes.data ?? [], origin: originRes.data ?? [] })
      } else if (typeStr === 'rectilinear') {
        const [shapeRes, xRes, yRes] = await Promise.all([
          client.GET('/get_grid_shape/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_x/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_y/{grid}', { params: { path: { grid: id } } }),
        ])
        setGridData({ type: 'rectilinear', rank, shape: shapeRes.data ?? [], x: xRes.data ?? [], y: yRes.data ?? [] })
      } else if (typeStr === 'structured_quadrilateral') {
        const [shapeRes, xRes, yRes] = await Promise.all([
          client.GET('/get_grid_shape/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_x/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_y/{grid}', { params: { path: { grid: id } } }),
        ])
        setGridData({ type: 'structured_quadrilateral', rank, shape: shapeRes.data ?? [], x: xRes.data ?? [], y: yRes.data ?? [] })
      } else if (typeStr === 'unstructured') {
        const [nodeCountRes, edgeCountRes, faceCountRes, xRes, yRes] = await Promise.all([
          client.GET('/get_grid_node_count/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_edge_count/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_face_count/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_x/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_y/{grid}', { params: { path: { grid: id } } }),
        ])
        const nodeCount = nodeCountRes.data ?? 0
        const edgeCount = edgeCountRes.data ?? 0
        const faceCount = faceCountRes.data ?? 0
        let edgeNodes: number[] | null = null
        let faceNodes: number[] | null = null
        let nodesPerFace: number[] | null = null
        if (edgeCount > 0) {
          const r = await client.GET('/get_grid_edge_nodes/{grid}', { params: { path: { grid: id } } })
          edgeNodes = r.data ?? null
        }
        if (faceCount > 0) {
          const [fnRes, npfRes] = await Promise.all([
            client.GET('/get_grid_face_nodes/{grid}', { params: { path: { grid: id } } }),
            client.GET('/get_grid_nodes_per_face/{grid}', { params: { path: { grid: id } } }),
          ])
          faceNodes = fnRes.data ?? null
          nodesPerFace = npfRes.data ?? null
        }
        setGridData({ type: 'unstructured', rank, nodeCount, edgeCount, faceCount, x: xRes.data ?? [], y: yRes.data ?? [], edgeNodes, faceNodes, nodesPerFace })
      }
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setLoadingGrid(false)
    }
  }

  const timeRange = model ? model.endTime - model.startTime : 0
  const progress = model && timeRange > 0
    ? ((model.currentTime - model.startTime) / timeRange) * 100
    : 0
  const atEnd = model != null && model.currentTime >= model.endTime
  const isRunning = ops.update || ops.updateUntil || playing
  const cfParsed = model ? parseCFTimeUnits(model.timeUnits) : null
  const toDisplayTime = (v: number) =>
    cfParsed ? formatCFDate(cfParsed.epoch, cfParsed.multiplierMs, v) : v.toFixed(3)
  const displayData = chartData.map(d => ({
    time: +d.time.toFixed(4),
    value: d.values[chartIndex],
  }))

  if (phase === 'idle') {
    return (
      <main className="init-screen">
        <div className="init-card">
          <h1>🎩 BMI Controller</h1>
          <p className="init-desc">
            Connect to a remoteBMI service and control the model lifecycle.
          </p>
          <div className="field">
            <label htmlFor="server-url">Server URL</label>
            <input
              id="server-url"
              type="text"
              value={serverUrl}
              onChange={e => handleServerUrlChange(e.target.value)}
              placeholder={DEFAULT_SERVER_URL}
              disabled={ops.init}
            />
          </div>
          <div className="field">
            <label htmlFor="config-file">Configuration file path</label>
            <input
              id="config-file"
              type="text"
              value={configFile}
              onChange={e => setConfigFile(e.target.value)}
              placeholder="config.json"
              disabled={ops.init}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button
            className="btn-primary"
            onClick={initialize}
            disabled={ops.init || !configFile.trim()}
          >
            {ops.init ? 'Initializing…' : 'Initialize'}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="dashboard">
      <header className="dash-header">
        <span className="dash-title">🎩 BMI Controller</span>
        {model && <span className="model-chip">{model.componentName}</span>}
        <span
          className={`status-dot status-${connected === null ? 'idle' : connected ? 'ready' : 'error'}`}
          title={connected === null ? 'checking connection…' : connected ? 'connected' : 'connection lost'}
        />
      </header>
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}
      <TimeSection
        model={model}
        toDisplayTime={toDisplayTime}
        progress={progress}
        isRunning={isRunning}
        playing={playing}
        phase={phase}
        atEnd={atEnd}
        ops={ops}
        updateUntilTime={updateUntilTime}
        onUpdateUntilTimeChange={setUpdateUntilTime}
        onStep={update}
        onPlay={play}
        onPause={pause}
        onRunUntil={updateUntil}
        onFinalize={finalize}
      />
      <VarsSection
        model={model}
        phase={phase}
        selectedInputVar={selectedInputVar}
        selectedOutputVar={selectedOutputVar}
        varInfo={varInfo}
        varMeta={varMeta}
        setValueInputs={setValueInputs}
        ops={ops}
        inputVarSizes={inputVarSizes}
        inputIndicesInput={inputIndicesInput}
        outputIndicesInput={outputIndicesInput}
        onSelectInputVar={selectInputVar}
        onSelectOutputVar={selectOutputVar}
        onSetValue={setValue}
        onSetValueInputChange={(name, v) => setSetValueInputs(prev => ({ ...prev, [name]: v }))}
        onInputIndicesChange={setInputIndicesInput}
        onOutputIndicesChange={setOutputIndicesInput}
        onGetValue={getValue}
      />
      <PlotSection
        model={model}
        chartVar={chartVar}
        chartIndex={chartIndex}
        displayData={displayData}
        varInfo={varInfo}
        varMeta={varMeta}
        isCFTime={cfParsed !== null}
        toDisplayTime={toDisplayTime}
        onChartVarChange={handleChartVarChange}
        onChartIndexChange={setChartIndex}
      />
      <GridSection
        availableGrids={availableGrids}
        gridVarMap={gridVarMap}
        selectedGridId={selectedGridId}
        gridData={gridData}
        loadingGrid={loadingGrid}
        gridVar={gridVar}
        gridVarValues={gridVarValues}
        gridShowFaces={gridShowFaces}
        gridShowEdges={gridShowEdges}
        gridShowNodes={gridShowNodes}
        varMeta={varMeta}
        onSelectGrid={selectGrid}
        onSelectGridVar={selectGridVar}
        onShowFacesChange={setGridShowFaces}
        onShowEdgesChange={setGridShowEdges}
        onShowNodesChange={setGridShowNodes}
      />
    </main>
  )
}

export default App

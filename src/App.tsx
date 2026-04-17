import { useRef, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { client } from './api/client.ts'
import { formatCFDate, parseCFTimeUnits } from './cfTime.ts'
import './App.css'

type Phase = 'idle' | 'ready' | 'finalized'

interface VarInfo {
  value: number[] | null
  loading: boolean
}

interface ModelState {
  componentName: string
  inputVars: string[]
  outputVars: string[]
  currentTime: number
  startTime: number
  endTime: number
  timeStep: number
  timeUnits: string
}

interface ChartPoint {
  time: number
  values: number[]
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.detail === 'string') return e.detail
    if (typeof e.title === 'string') return e.title
  }
  return String(err)
}

function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [configFile, setConfigFile] = useState('experiment_leakybucket_config.json')
  const [model, setModel] = useState<ModelState | null>(null)
  const [varInfo, setVarInfo] = useState<Record<string, VarInfo>>({})
  const [updateUntilTime, setUpdateUntilTime] = useState('')
  const [ops, setOps] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [setValueInputs, setSetValueInputs] = useState<Record<string, string>>({})
  const [chartVar, setChartVar] = useState('')
  const [chartIndex, setChartIndex] = useState(0)
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [playing, setPlaying] = useState(false)
  const playingRef = useRef(false)

  function startOp(key: string) { setOps(p => ({ ...p, [key]: true })) }
  function endOp(key: string) { setOps(p => ({ ...p, [key]: false })) }

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
      // chart recording is non-critical
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

  async function initialize() {
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

      setModel({
        componentName: nameRes.data?.name ?? 'Unknown',
        inputVars: Array.isArray(inputRes.data) ? inputRes.data : inputRes.data != null ? [inputRes.data as unknown as string] : [],
        outputVars: Array.isArray(outputRes.data) ? outputRes.data : outputRes.data != null ? [outputRes.data as unknown as string] : [],
        currentTime: curRes.data ?? 0,
        startTime: startRes.data ?? 0,
        endTime: endRes.data ?? 0,
        timeStep: stepRes.data ?? 0,
        timeUnits: unitsRes.data?.units ?? '',
      })
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

  async function getValue(name: string) {
    setVarInfo(prev => ({
      ...prev,
      [name]: { value: prev[name]?.value ?? null, loading: true },
    }))
    try {
      const { data, error: err } = await client.GET('/get_value/{name}', {
        params: { path: { name } },
      })
      if (err) setError(getErrorMessage(err))
      setVarInfo(prev => ({
        ...prev,
        [name]: { value: data ?? null, loading: false },
      }))
    } catch (e) {
      setError(getErrorMessage(e))
      setVarInfo(prev => ({ ...prev, [name]: { ...prev[name], loading: false } }))
    }
  }

  async function setValue(name: string) {
    const raw = setValueInputs[name] ?? ''
    const values = raw.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
    if (!values.length) { setError('Enter comma-separated numbers'); return }
    setError(null)
    startOp(`set_${name}`)
    try {
      const { error: err } = await client.POST('/set_value/{name}', {
        params: { path: { name } },
        body: values,
      })
      if (err) { setError(getErrorMessage(err)); return }
      await getValue(name)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      endOp(`set_${name}`)
    }
  }

  async function handleChartVarChange(name: string) {
    setChartVar(name)
    setChartData([])
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
          <h1>BMI Controller</h1>
          <p className="init-desc">
            Connect to a remoteBMI service and control the model lifecycle.
          </p>
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
        <span className="dash-title">BMI Controller</span>
        {model && <span className="model-chip">{model.componentName}</span>}
        <span className={`status-dot status-${phase}`} title={phase} />
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      <section className="time-section">
        <div className="time-info">
          <span className="time-label">t</span>
          <span className="time-value">{model ? toDisplayTime(model.currentTime) : '—'}</span>
          <span className="time-sep">/</span>
          <span className="time-end">{model ? toDisplayTime(model.endTime) : '—'}</span>
          <span className="time-meta">step: {model?.timeStep}</span>
          <span className="time-meta">[{model?.timeUnits}]</span>
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progress-fill" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
        <div className="controls">
          <button
            className="btn-primary"
            onClick={update}
            disabled={isRunning || phase === 'finalized' || atEnd}
          >
            {ops.update ? '…' : '▶ Step'}
          </button>
          <button
            className={playing ? 'btn-secondary' : 'btn-primary'}
            onClick={playing ? pause : play}
            disabled={!playing && (isRunning || phase === 'finalized' || atEnd)}
          >
            {playing ? '⏸ Pause' : '▶▶ Play'}
          </button>
          <div className="control-group">
            <input
              type="number"
              className="time-input"
              placeholder={`until (${model?.timeUnits ?? '?'})`}
              value={updateUntilTime}
              onChange={e => setUpdateUntilTime(e.target.value)}
              disabled={isRunning || phase === 'finalized' || atEnd}
            />
            <button
              className="btn-secondary"
              onClick={updateUntil}
              disabled={isRunning || phase === 'finalized' || !updateUntilTime || atEnd}
            >
              {ops.updateUntil ? '…' : '▶▶ Run Until'}
            </button>
          </div>
          <button
            className="btn-danger"
            onClick={finalize}
            disabled={ops.finalize || phase === 'finalized'}
          >
            {ops.finalize ? '…' : 'Finalize'}
          </button>
        </div>
      </section>

      <div className="vars-grid">
        <section className="vars-section">
          <h2>
            Input Variables
            <span className="badge">{model?.inputVars.length ?? 0}</span>
          </h2>
          {model?.inputVars.map(name => (
            <VarRow
              key={name}
              name={name}
              info={varInfo[name]}
              isInput
              disabled={phase === 'finalized'}
              setValueInput={setValueInputs[name] ?? ''}
              settingValue={ops[`set_${name}`] ?? false}
              onGetValue={() => getValue(name)}
              onSetValue={() => setValue(name)}
              onSetValueInputChange={v =>
                setSetValueInputs(prev => ({ ...prev, [name]: v }))
              }
            />
          ))}
        </section>
        <section className="vars-section">
          <h2>
            Output Variables
            <span className="badge">{model?.outputVars.length ?? 0}</span>
          </h2>
          {model?.outputVars.map(name => (
            <VarRow
              key={name}
              name={name}
              info={varInfo[name]}
              isInput={false}
              disabled={phase === 'finalized'}
              setValueInput=""
              settingValue={false}
              onGetValue={() => getValue(name)}
              onSetValue={() => {}}
              onSetValueInputChange={() => {}}
            />
          ))}
        </section>
      </div>

      <section className="chart-section">
        <h2 className="chart-heading">Plot</h2>
        <div className="chart-controls">
          <div className="field-row">
            <label htmlFor="chart-var">Variable</label>
            <select
              id="chart-var"
              value={chartVar}
              onChange={e => handleChartVarChange(e.target.value)}
            >
              <option value="">Select…</option>
              {model?.outputVars.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <label htmlFor="chart-index">Index</label>
            <input
              id="chart-index"
              type="number"
              min={0}
              value={chartIndex}
              onChange={e => setChartIndex(Math.max(0, parseInt(e.target.value) || 0))}
              className="index-input"
            />
          </div>
        </div>
        {chartVar && displayData.length === 0 && (
          <p className="chart-empty">Step the model to collect data.</p>
        )}
        {chartVar && displayData.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={displayData} margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11 }}
                tickFormatter={cfParsed ? toDisplayTime : undefined}
                label={cfParsed ? undefined : { value: model?.timeUnits ?? '', position: 'insideBottomRight', offset: -8, fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} width={64} />
              <Tooltip
                contentStyle={{ fontSize: 12, background: 'var(--social-bg)', border: '1px solid var(--border)', borderRadius: 6 }}
                labelFormatter={v => toDisplayTime(v as number)}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                name={`${chartVar}[${chartIndex}]`}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>
    </main>
  )
}

interface VarRowProps {
  name: string
  info: VarInfo | undefined
  isInput: boolean
  disabled: boolean
  setValueInput: string
  settingValue: boolean
  onGetValue: () => void
  onSetValue: () => void
  onSetValueInputChange: (v: string) => void
}

function VarRow({
  name,
  info,
  isInput,
  disabled,
  setValueInput,
  settingValue,
  onGetValue,
  onSetValue,
  onSetValueInputChange,
}: VarRowProps) {
  return (
    <div className="var-row">
      <div className="var-header">
        <code className="var-name">{name}</code>
        <button
          className="btn-sm"
          onClick={onGetValue}
          disabled={disabled || info?.loading}
        >
          {info?.loading ? '…' : 'Get'}
        </button>
      </div>
      {info?.value != null && (
        <div className="var-value">
          [{info.value.slice(0, 8).map(v => v.toPrecision(4)).join(', ')}
          {info.value.length > 8 ? `, … (${info.value.length} values)` : ''}]
        </div>
      )}
      {isInput && (
        <div className="var-set">
          <input
            type="text"
            placeholder="values (comma-separated)"
            value={setValueInput}
            onChange={e => onSetValueInputChange(e.target.value)}
            disabled={disabled}
          />
          <button
            className="btn-sm btn-accent"
            onClick={onSetValue}
            disabled={disabled || settingValue || !setValueInput.trim()}
          >
            {settingValue ? '…' : 'Set'}
          </button>
        </div>
      )}
    </div>
  )
}

export default App

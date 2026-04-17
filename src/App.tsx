import { useState } from 'react'
import { client } from './api/client.ts'
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

  function startOp(key: string) { setOps(p => ({ ...p, [key]: true })) }
  function endOp(key: string) { setOps(p => ({ ...p, [key]: false })) }

  async function refreshCurrentTime() {
    const { data } = await client.GET('/get_current_time')
    if (data !== undefined) {
      setModel(prev => prev ? { ...prev, currentTime: data } : prev)
    }
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
      await refreshCurrentTime()
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
      await refreshCurrentTime()
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

  const timeRange = model ? model.endTime - model.startTime : 0
  const progress = model && timeRange > 0
    ? ((model.currentTime - model.startTime) / timeRange) * 100
    : 0
  const atEnd = model != null && model.currentTime >= model.endTime
  const isRunning = ops.update || ops.updateUntil

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
          <span className="time-value">{model?.currentTime.toFixed(3)}</span>
          <span className="time-sep">/</span>
          <span className="time-end">{model?.endTime.toFixed(3)}</span>
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

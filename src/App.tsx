import { useModelState } from './hooks/useModelState.ts'
import { TimeSection } from './components/TimeSection.tsx'
import { VarsSection } from './components/VarsSection.tsx'
import { PlotSection } from './components/PlotSection.tsx'
import { GridSection } from './components/GridSection.tsx'
import './App.css'

function App() {
  const s = useModelState()

  if (s.phase === 'idle') {
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
              value={s.serverUrl}
              onChange={e => s.handleServerUrlChange(e.target.value)}
              disabled={s.ops.init}
            />
          </div>
          <div className="field">
            <label htmlFor="config-file">Configuration file path</label>
            <input
              id="config-file"
              type="text"
              value={s.configFile}
              onChange={e => s.setConfigFile(e.target.value)}
              placeholder="config.json"
              disabled={s.ops.init}
            />
          </div>
          {s.error && <p className="error">{s.error}</p>}
          <button
            className="btn-primary"
            onClick={s.initialize}
            disabled={s.ops.init || !s.configFile.trim()}
          >
            {s.ops.init ? 'Initializing…' : 'Initialize'}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="dashboard">
      <header className="dash-header">
        <span className="dash-title">🎩 BMI Controller</span>
        {s.model && <span className="model-chip">{s.model.componentName}</span>}
        <span
          className={`status-dot status-${s.connected === null ? 'idle' : s.connected ? 'ready' : 'error'}`}
          title={s.connected === null ? 'checking connection…' : s.connected ? 'connected' : 'connection lost'}
        />
      </header>
      {s.error && (
        <div className="error-banner">
          <span>{s.error}</span>
          <button onClick={() => s.setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}
      <TimeSection
        model={s.model}
        toDisplayTime={s.toDisplayTime}
        progress={s.progress}
        isRunning={s.isRunning}
        playing={s.playing}
        phase={s.phase}
        atEnd={s.atEnd}
        ops={s.ops}
        updateUntilTime={s.updateUntilTime}
        onUpdateUntilTimeChange={s.setUpdateUntilTime}
        onStep={s.update}
        onPlay={s.play}
        onPause={s.pause}
        onRunUntil={s.updateUntil}
        onFinalize={s.finalize}
      />
      <VarsSection
        model={s.model}
        phase={s.phase}
        selectedInputVar={s.selectedInputVar}
        selectedOutputVar={s.selectedOutputVar}
        varInfo={s.varInfo}
        varMeta={s.varMeta}
        setValueInputs={s.setValueInputs}
        ops={s.ops}
        inputVarSizes={s.inputVarSizes}
        inputIndicesInput={s.inputIndicesInput}
        outputIndicesInput={s.outputIndicesInput}
        onSelectInputVar={s.selectInputVar}
        onSelectOutputVar={s.selectOutputVar}
        onSetValue={s.setValue}
        onSetValueInputChange={s.setValueInput}
        onInputIndicesChange={s.setInputIndicesInput}
        onOutputIndicesChange={s.setOutputIndicesInput}
        onGetValue={s.getValue}
      />
      <PlotSection
        model={s.model}
        chartVar={s.chartVar}
        chartIndex={s.chartIndex}
        displayData={s.displayData}
        varInfo={s.varInfo}
        varMeta={s.varMeta}
        isCFTime={s.isCFTime}
        toDisplayTime={s.toDisplayTime}
        onChartVarChange={s.handleChartVarChange}
        onChartIndexChange={s.setChartIndex}
      />
      <GridSection
        availableGrids={s.availableGrids}
        gridVarMap={s.gridVarMap}
        selectedGridId={s.selectedGridId}
        gridData={s.gridData}
        loadingGrid={s.loadingGrid}
        gridVar={s.gridVar}
        gridVarValues={s.gridVarValues}
        gridShowFaces={s.gridShowFaces}
        gridShowEdges={s.gridShowEdges}
        gridShowNodes={s.gridShowNodes}
        varMeta={s.varMeta}
        onSelectGrid={s.selectGrid}
        onSelectGridVar={s.selectGridVar}
        onShowFacesChange={s.setGridShowFaces}
        onShowEdgesChange={s.setGridShowEdges}
        onShowNodesChange={s.setGridShowNodes}
      />
    </main>
  )
}

export default App

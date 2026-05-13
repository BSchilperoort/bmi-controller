import type { Phase, VarInfo, VarMeta, ModelState } from '../interfaces/index.ts'
import { VarRow } from './VarRow.tsx'

interface VarsSectionProps {
  model: ModelState | null
  phase: Phase
  selectedInputVar: string
  selectedOutputVar: string
  varInfo: Record<string, VarInfo>
  varMeta: Record<string, VarMeta>
  setValueInputs: Record<string, string>
  ops: Record<string, boolean>
  inputVarSizes: Record<string, number>
  inputIndicesInput: string
  outputIndicesInput: string
  onSelectInputVar: (name: string) => void
  onSelectOutputVar: (name: string) => void
  onSetValue: (name: string, indicesStr: string) => void
  onSetValueInputChange: (name: string, v: string) => void
  onInputIndicesChange: (v: string) => void
  onOutputIndicesChange: (v: string) => void
  onGetValue: (name: string, indicesStr: string) => void
}

export function VarsSection({
  model, phase, selectedInputVar, selectedOutputVar,
  varInfo, varMeta, setValueInputs, ops, inputVarSizes,
  inputIndicesInput, outputIndicesInput,
  onSelectInputVar, onSelectOutputVar, onSetValue, onSetValueInputChange,
  onInputIndicesChange, onOutputIndicesChange, onGetValue,
}: VarsSectionProps) {
  return (
    <div className="vars-grid">
      <section className="vars-section">
        <h2>
          Input Variables
          <span className="badge">{model?.inputVars.length ?? 0}</span>
        </h2>
        <div className="var-select-wrap">
          <select
            className="var-select"
            value={selectedInputVar}
            onChange={e => onSelectInputVar(e.target.value)}
          >
            <option value="">Select…</option>
            {model?.inputVars.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {selectedInputVar && (
            <button className="var-clear" onClick={() => onSelectInputVar('')} aria-label="Deselect input variable">×</button>
          )}
        </div>
        {selectedInputVar && (
          <VarRow
            info={varInfo[selectedInputVar]}
            isInput
            disabled={phase === 'finalized'}
            setValueInput={setValueInputs[selectedInputVar] ?? ''}
            settingValue={ops[`set_${selectedInputVar}`] ?? false}
            valueCount={inputVarSizes[selectedInputVar]}
            meta={varMeta[selectedInputVar]}
            indicesInput={inputIndicesInput}
            onSetValue={() => onSetValue(selectedInputVar, inputIndicesInput)}
            onSetValueInputChange={v => onSetValueInputChange(selectedInputVar, v)}
            onIndicesChange={onInputIndicesChange}
          />
        )}
      </section>
      <section className="vars-section">
        <h2>
          Output Variables
          <span className="badge">{model?.outputVars.length ?? 0}</span>
        </h2>
        <div className="var-select-wrap">
          <select
            className="var-select"
            value={selectedOutputVar}
            onChange={e => onSelectOutputVar(e.target.value)}
          >
            <option value="">Select…</option>
            {model?.outputVars.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {selectedOutputVar && (
            <button className="var-clear" onClick={() => onSelectOutputVar('')} aria-label="Deselect output variable">×</button>
          )}
        </div>
        {selectedOutputVar && (
          <>
            <div className="var-indices">
              <input
                type="text"
                placeholder="indices (optional, comma-separated)"
                value={outputIndicesInput}
                onChange={e => onOutputIndicesChange(e.target.value)}
              />
              <button
                className="btn-sm btn-secondary"
                onClick={() => onGetValue(selectedOutputVar, outputIndicesInput)}
                disabled={varInfo[selectedOutputVar]?.loading}
              >
                {varInfo[selectedOutputVar]?.loading ? '…' : 'Get'}
              </button>
            </div>
            <VarRow
              info={varInfo[selectedOutputVar]}
              isInput={false}
              disabled={phase === 'finalized'}
              setValueInput=""
              settingValue={false}
              meta={varMeta[selectedOutputVar]}
              onSetValue={() => {}}
              onSetValueInputChange={() => {}}
            />
          </>
        )}
      </section>
    </div>
  )
}

import type { VarInfo, VarMeta } from '../interfaces/index.ts'

export interface VarRowProps {
  info: VarInfo | undefined
  isInput: boolean
  disabled: boolean
  setValueInput: string
  settingValue: boolean
  valueCount?: number
  meta?: VarMeta
  indicesInput?: string
  onSetValue: () => void
  onSetValueInputChange: (v: string) => void
  onIndicesChange?: (v: string) => void
}

export function VarRow({
  info,
  isInput,
  disabled,
  setValueInput,
  settingValue,
  valueCount,
  meta,
  indicesInput,
  onSetValue,
  onSetValueInputChange,
  onIndicesChange,
}: VarRowProps) {
  return (
    <div className="var-row">
      {!isInput && info?.value != null && (
        <div className="var-value">
          [{info.value.slice(0, 8).map(v => v.toPrecision(4)).join(', ')}
          {info.value.length > 8 ? `, … (${info.value.length} values)` : ''}]
        </div>
      )}
      {isInput && (
        <>
          <div className="var-set">
            <input
              type="text"
              placeholder={valueCount != null ? `${valueCount} value${valueCount === 1 ? '' : 's'}, comma-separated` : 'values (comma-separated)'}
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
          <div className="var-indices">
            <input
              type="text"
              placeholder="indices (optional, comma-separated)"
              value={indicesInput ?? ''}
              onChange={e => onIndicesChange?.(e.target.value)}
              disabled={disabled}
            />
          </div>
        </>
      )}
      {meta && (
        <dl className="var-meta">
          {meta.units && <><dt>Unit</dt><dd>{meta.units}</dd></>}
          {meta.vartype && <><dt>Type</dt><dd>{meta.vartype}</dd></>}
          {meta.size != null && <><dt>Size</dt><dd>{meta.size}</dd></>}
          {meta.grid != null && <><dt>Grid</dt><dd>{meta.grid}{meta.gridType ? ` (${meta.gridType.replace(/_/g, ' ')})` : ''}</dd></>}
        </dl>
      )}
    </div>
  )
}

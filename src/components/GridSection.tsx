import type { VarMeta } from '../interfaces/index.ts'
import { GridView, type GridData } from './GridView.tsx'
import { getLayerInfo, layerZ, sliceLayer } from '../utils/gridLayers.ts'

interface GridSectionProps {
  availableGrids: Map<number, string>
  gridVarMap: Map<number, string[]>
  selectedGridId: number | null
  gridData: GridData | null
  loadingGrid: boolean
  gridVar: string
  gridVarValues: number[] | null
  gridShowFaces: boolean
  gridShowEdges: boolean
  gridShowNodes: boolean
  gridLayer: number
  varMeta: Record<string, VarMeta>
  onSelectGrid: (id: number | null) => void
  onSelectGridVar: (name: string) => void
  onShowFacesChange: (v: boolean) => void
  onShowEdgesChange: (v: boolean) => void
  onShowNodesChange: (v: boolean) => void
  onLayerChange: (v: number) => void
}

export function GridSection({
  availableGrids, gridVarMap, selectedGridId, gridData, loadingGrid,
  gridVar, gridVarValues, gridShowFaces, gridShowEdges, gridShowNodes, gridLayer, varMeta,
  onSelectGrid, onSelectGridVar, onShowFacesChange, onShowEdgesChange, onShowNodesChange, onLayerChange,
}: GridSectionProps) {
  if (availableGrids.size === 0) return null

  const layerInfo = gridData ? getLayerInfo(gridData, gridVarValues) : null
  const layer = layerInfo ? Math.min(gridLayer, layerInfo.count - 1) : 0
  const view = gridData && layerInfo
    ? sliceLayer(gridData, gridVarValues ?? undefined, layerInfo, layer)
    : { data: gridData, values: gridVarValues ?? undefined }
  const z = gridData && layerInfo ? layerZ(gridData, layerInfo, layer) : null

  return (
    <details className="chart-section" open>
      <summary className="chart-heading">Grid View</summary>
      <div className="chart-controls">
        <div className="field-row">
          <label htmlFor="grid-select">Grid</label>
          <select
            id="grid-select"
            value={selectedGridId ?? ''}
            onChange={e => onSelectGrid(e.target.value !== '' ? Number(e.target.value) : null)}
          >
            <option value="">Select…</option>
            {[...availableGrids.entries()].map(([id, type]) => (
              <option key={id} value={id}>Grid {id} ({type.replace(/_/g, ' ')})</option>
            ))}
          </select>
          {selectedGridId !== null && (
            <button className="var-clear var-clear-inline" onClick={() => onSelectGrid(null)} aria-label="Deselect grid">×</button>
          )}
        </div>
        {selectedGridId !== null && (gridVarMap.get(selectedGridId)?.length ?? 0) > 0 && (
          <div className="field-row">
            <label htmlFor="grid-var-select">Variable</label>
            <select
              id="grid-var-select"
              value={gridVar}
              onChange={e => onSelectGridVar(e.target.value)}
            >
              <option value="">None</option>
              {gridVarMap.get(selectedGridId)?.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            {gridVar && (
              <button className="var-clear var-clear-inline" onClick={() => onSelectGridVar('')} aria-label="Deselect grid variable">×</button>
            )}
          </div>
        )}
        {layerInfo && layerInfo.count > 1 && (
          <div className="field-row">
            <label htmlFor="grid-layer">Z layer</label>
            <input
              id="grid-layer"
              type="range"
              min={0}
              max={layerInfo.count - 1}
              value={layer}
              onChange={e => onLayerChange(Number(e.target.value))}
            />
            <input
              className="index-input"
              type="number"
              min={0}
              max={layerInfo.count - 1}
              value={layer}
              onChange={e => {
                const v = Number(e.target.value)
                if (Number.isInteger(v)) onLayerChange(Math.max(0, Math.min(layerInfo.count - 1, v)))
              }}
              aria-label="Z layer index"
            />
            <span className="grid-layer-info">
              / {layerInfo.count - 1}{z !== null && ` (z = ${Number(z.toPrecision(6))})`}
            </span>
          </div>
        )}
        {gridData && (gridData.type === 'structured_quadrilateral' || gridData.type === 'unstructured') && (
          <div className="field-row">
            <label>Show</label>
            <label className="grid-toggle">
              <input type="checkbox" checked={gridShowFaces} onChange={e => onShowFacesChange(e.target.checked)} />
              faces
            </label>
            <label className="grid-toggle">
              <input type="checkbox" checked={gridShowEdges} onChange={e => onShowEdgesChange(e.target.checked)} />
              edges
            </label>
            <label className="grid-toggle">
              <input type="checkbox" checked={gridShowNodes} onChange={e => onShowNodesChange(e.target.checked)} />
              nodes
            </label>
          </div>
        )}
      </div>
      {loadingGrid && <p className="chart-empty">Loading grid…</p>}
      {!loadingGrid && selectedGridId !== null && !gridData && (
        <p className="chart-empty">
          No 2D view for grid type "{availableGrids.get(selectedGridId)}".
        </p>
      )}
      {!loadingGrid && view.data && (
        <GridView
          data={view.data}
          values={view.values}
          units={varMeta[gridVar]?.units}
          showFaces={gridShowFaces}
          showEdges={gridShowEdges}
          showNodes={gridShowNodes}
        />
      )}
    </details>
  )
}

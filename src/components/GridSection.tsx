import type { VarMeta } from '../interfaces/index.ts'
import { GridView, type GridData } from './GridView.tsx'

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
  varMeta: Record<string, VarMeta>
  onSelectGrid: (id: number | null) => void
  onSelectGridVar: (name: string) => void
  onShowFacesChange: (v: boolean) => void
  onShowEdgesChange: (v: boolean) => void
  onShowNodesChange: (v: boolean) => void
}

export function GridSection({
  availableGrids, gridVarMap, selectedGridId, gridData, loadingGrid,
  gridVar, gridVarValues, gridShowFaces, gridShowEdges, gridShowNodes, varMeta,
  onSelectGrid, onSelectGridVar, onShowFacesChange, onShowEdgesChange, onShowNodesChange,
}: GridSectionProps) {
  if (availableGrids.size === 0) return null

  return (
    <section className="chart-section">
      <h2 className="chart-heading">Grid View</h2>
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
      {!loadingGrid && gridData && (
        <GridView
          data={gridData}
          values={gridVarValues ?? undefined}
          units={varMeta[gridVar]?.units}
          showFaces={gridShowFaces}
          showEdges={gridShowEdges}
          showNodes={gridShowNodes}
        />
      )}
    </section>
  )
}

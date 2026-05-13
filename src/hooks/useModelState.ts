import { useConnection } from './useConnection.ts'
import { useModelVars } from './useModelVars.ts'
import { useChartState } from './useChartState.ts'
import { useGridState } from './useGridState.ts'
import { usePlayLoop } from './usePlayLoop.ts'

export function useModelState() {
  const conn = useConnection()
  const vars = useModelVars({
    model: conn.model,
    startOp: conn.startOp,
    endOp: conn.endOp,
    setError: conn.setError,
  })
  const chart = useChartState({
    model: conn.model,
    fetchVarMeta: vars.fetchVarMeta,
    setVarInfo: vars.setVarInfo,
  })
  const grid = useGridState({
    availableGrids: conn.availableGrids,
    setError: conn.setError,
  })
  const loop = usePlayLoop({
    model: conn.model,
    startOp: conn.startOp,
    endOp: conn.endOp,
    setError: conn.setError,
    setValidPrefills: vars.setValidPrefills,
    prefillInputVar: vars.prefillInputVar,
    selectGridVar: grid.selectGridVar,
    recordChartPoint: chart.recordChartPoint,
    refreshCurrentTime: conn.refreshCurrentTime,
    selectedInputVarRef: vars.selectedInputVarRef,
    gridVarRef: grid.gridVarRef,
    chartVarRef: chart.chartVarRef,
  })

  const timeRange = conn.model ? conn.model.endTime - conn.model.startTime : 0
  const progress = conn.model && timeRange > 0
    ? ((conn.model.currentTime - conn.model.startTime) / timeRange) * 100
    : 0
  const atEnd = conn.model != null && conn.model.currentTime >= conn.model.endTime
  const isRunning = conn.ops.update || conn.ops.updateUntil || loop.playing

  return {
    ...conn,
    ...vars,
    ...chart,
    ...grid,
    ...loop,
    progress, atEnd, isRunning,
  }
}

export type Phase = 'idle' | 'ready' | 'finalized'

export interface VarMeta {
  units: string
  vartype: string
  grid: number | null
  gridType: string | null
  size: number | null
}

export interface VarInfo {
  value: number[] | null
  loading: boolean
}

export interface ModelState {
  componentName: string
  inputVars: string[]
  outputVars: string[]
  currentTime: number
  startTime: number
  endTime: number
  timeStep: number
  timeUnits: string
}

export interface ChartPoint {
  time: number
  values: number[]
}

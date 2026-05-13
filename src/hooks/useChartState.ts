import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { client } from '../api/client.ts'
import { formatCFDate, parseCFTimeUnits } from '../utils/cfTime.ts'
import type { ModelState, VarInfo, ChartPoint } from '../interfaces/index.ts'

interface Params {
  model: ModelState | null
  fetchVarMeta: (name: string) => void
  setVarInfo: Dispatch<SetStateAction<Record<string, VarInfo>>>
}

export function useChartState({ model, fetchVarMeta, setVarInfo }: Params) {
  const [chartVar, setChartVar] = useState('')
  const [chartIndex, setChartIndex] = useState(0)
  const [chartData, setChartData] = useState<ChartPoint[]>([])

  const chartVarRef = useRef(chartVar)
  chartVarRef.current = chartVar

  const cfParsed = model ? parseCFTimeUnits(model.timeUnits) : null
  const toDisplayTime = (v: number) =>
    cfParsed ? formatCFDate(cfParsed.epoch, cfParsed.multiplierMs, v) : v.toFixed(3)

  const displayData = chartData.map(d => ({
    time: +d.time.toFixed(4),
    value: d.values[chartIndex],
  }))

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
    } catch { /* non-critical */ }
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
    } catch { /* ignore */ }
  }

  return {
    chartVar, chartVarRef,
    chartIndex, setChartIndex,
    displayData,
    isCFTime: cfParsed !== null,
    toDisplayTime,
    recordChartPoint,
    handleChartVarChange,
  }
}

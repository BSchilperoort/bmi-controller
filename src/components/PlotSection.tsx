import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { ModelState, VarInfo, VarMeta } from '../interfaces/index.ts'

interface PlotSectionProps {
  model: ModelState | null
  chartVar: string
  chartIndex: number
  displayData: { time: number; value: number }[]
  varInfo: Record<string, VarInfo>
  varMeta: Record<string, VarMeta>
  isCFTime: boolean
  toDisplayTime: (v: number) => string
  onChartVarChange: (name: string) => void
  onChartIndexChange: (idx: number) => void
}

export function PlotSection({
  model, chartVar, chartIndex, displayData, varInfo, varMeta,
  isCFTime, toDisplayTime, onChartVarChange, onChartIndexChange,
}: PlotSectionProps) {
  return (
    <section className="chart-section">
      <h2 className="chart-heading">Plot</h2>
      <div className="chart-controls">
        <div className="field-row">
          <label htmlFor="chart-var">Variable</label>
          <select
            id="chart-var"
            value={chartVar}
            onChange={e => onChartVarChange(e.target.value)}
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
            max={chartVar ? (varInfo[chartVar]?.value?.length ?? 1) - 1 : undefined}
            value={chartIndex}
            onChange={e => {
              const size = varInfo[chartVar]?.value?.length
              const parsed = parseInt(e.target.value) || 0
              onChartIndexChange(Math.min(Math.max(0, parsed), size != null ? size - 1 : parsed))
            }}
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
              tickFormatter={isCFTime ? toDisplayTime : undefined}
              label={isCFTime ? undefined : { value: model?.timeUnits ?? '', position: 'insideBottomRight', offset: -8, fontSize: 11 }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              width={64}
              label={varMeta[chartVar]?.units ? { value: varMeta[chartVar].units, angle: -90, position: 'insideLeft', offset: 12, fontSize: 11 } : undefined}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, background: 'var(--social-bg)', border: '1px solid var(--border)', borderRadius: 6 }}
              labelFormatter={v => toDisplayTime(v as number)}
            />
            <Line
              type="linear"
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
  )
}

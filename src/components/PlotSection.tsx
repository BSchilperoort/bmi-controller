import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
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

const W = 800
const IH = 172  // fixed chart-area height; bottom margin is computed per render
const M = { top: 8, right: 24, left: 64 }
const IW = W - M.left - M.right
const TICK_ANGLE = 40 * (Math.PI / 180)
const APPROX_CHAR_W = 6.5  // average px per character at 11px system-ui
const APPROX_LINE_H = 13

function computeBottomMargin(
  xScale: d3.ScaleLinear<number, number>,
  isCFTime: boolean,
  toDisplayTime: (v: number) => string,
): number {
  const labels = xScale.ticks().map(v => (isCFTime ? toDisplayTime(v) : d3.format('~g')(v)))
  const maxChars = Math.max(...labels.map(s => s.length), 1)
  const projected = maxChars * APPROX_CHAR_W * Math.sin(TICK_ANGLE) + APPROX_LINE_H * Math.cos(TICK_ANGLE)
  return Math.ceil(projected) + 14  // +14: tick line (6px) + breathing room
}

function buildFullPath(
  data: { time: number; value: number }[],
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
): string {
  return (
    d3
      .line<{ time: number; value: number }>()
      .x(d => xScale(d.time))
      .y(d => yScale(d.value))(data) ?? ''
  )
}

function updateYAxis(
  group: SVGGElement,
  yScale: d3.ScaleLinear<number, number>,
) {
  d3.select(group)
    .call(d3.axisLeft(yScale).tickSizeOuter(0))
    .style('font-size', '11px')
    .call(g => g.selectAll<SVGTextElement, unknown>('text').attr('fill', 'var(--text)'))
    .call(g => g.select('.domain').attr('stroke', 'var(--border)'))
    .call(g => g.selectAll('.tick line').attr('stroke', 'var(--border)'))
}

function updateYGrid(
  group: SVGGElement,
  yScale: d3.ScaleLinear<number, number>,
) {
  d3.select(group)
    .call(d3.axisLeft(yScale).tickSize(-IW).tickFormat(() => ''))
    .call(g => {
      g.select('.domain').remove()
      g.selectAll('.tick line').attr('stroke', 'var(--border)')
    })
}

export function PlotSection({
  model, chartVar, chartIndex, displayData, varInfo, varMeta,
  isCFTime, toDisplayTime, onChartVarChange, onChartIndexChange,
}: PlotSectionProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  // D3 mutable state — never triggers React re-renders
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const linePathRef = useRef<SVGPathElement | null>(null)
  const yAxisGroupRef = useRef<SVGGElement | null>(null)
  const yGridGroupRef = useRef<SVGGElement | null>(null)
  const yLabelRef = useRef<SVGTextElement | null>(null)
  const prevDataLenRef = useRef(0)
  const yExtentRef = useRef<[number, number] | null>(null)

  // Always-fresh refs so D3 event handlers never see stale closures
  const displayDataRef = useRef(displayData)
  const toDisplayTimeRef = useRef(toDisplayTime)
  displayDataRef.current = displayData
  toDisplayTimeRef.current = toDisplayTime

  // Build or rebuild the SVG when the selected variable or model time range changes
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !model) return

    prevDataLenRef.current = 0
    yExtentRef.current = null

    const sel = d3.select(svg)
    sel.selectAll('*').remove()

    const xScale = d3.scaleLinear().domain([model.startTime, model.endTime]).range([0, IW])
    const yScale = d3.scaleLinear().domain([0, 1]).range([IH, 0]).nice()
    xScaleRef.current = xScale
    yScaleRef.current = yScale

    const bottomMargin = computeBottomMargin(xScale, isCFTime, toDisplayTimeRef.current)
    sel.attr('viewBox', `0 0 ${W} ${M.top + IH + bottomMargin}`)

    const g = sel.append('g').attr('transform', `translate(${M.left},${M.top})`)

    // x grid
    g.append('g')
      .attr('transform', `translate(0,${IH})`)
      .call(d3.axisBottom(xScale).tickSize(-IH).tickFormat(() => ''))
      .call(gg => {
        gg.select('.domain').remove()
        gg.selectAll('.tick line').attr('stroke', 'var(--border)')
      })

    // y grid (updated when y scale expands)
    yGridGroupRef.current = g
      .append('g')
      .call(d3.axisLeft(yScale).tickSize(-IW).tickFormat(() => ''))
      .call(gg => {
        gg.select('.domain').remove()
        gg.selectAll('.tick line').attr('stroke', 'var(--border)')
      })
      .node()

    // x axis
    g.append('g')
      .attr('transform', `translate(0,${IH})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickSizeOuter(0)
          .tickFormat(isCFTime ? v => toDisplayTimeRef.current(+v) : null),
      )
      .style('font-size', '11px')
      .call(gg => gg.select('.domain').attr('stroke', 'var(--border)'))
      .call(gg => gg.selectAll('.tick line').attr('stroke', 'var(--border)'))
      .call(gg =>
        gg
          .selectAll<SVGTextElement, unknown>('text')
          .attr('fill', 'var(--text)')
          .attr('transform', 'rotate(-40)')
          .attr('text-anchor', 'end')
          .attr('dx', '-0.4em')
          .attr('dy', '0.2em'),
      )

    // y axis (updated when y scale expands)
    yAxisGroupRef.current = g.append('g').node()
    if (yAxisGroupRef.current) updateYAxis(yAxisGroupRef.current, yScale)

    // x axis label
    if (!isCFTime && model.timeUnits) {
      g.append('text')
        .attr('x', IW)
        .attr('y', IH + bottomMargin - 4)
        .attr('text-anchor', 'end')
        .style('font-size', '11px')
        .attr('fill', 'var(--text)')
        .text(model.timeUnits)
    }

    // y axis label (text updated separately when units become available)
    yLabelRef.current = g
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -M.top)
      .attr('y', -(M.left - 14))
      .attr('text-anchor', 'end')
      .style('font-size', '11px')
      .attr('fill', 'var(--text)')
      .text('')
      .node()

    // Line
    linePathRef.current = g
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 1.5)
      .node()

    // Hover elements
    const hoverLine = g
      .append('line')
      .attr('y1', 0)
      .attr('y2', IH)
      .attr('stroke', 'var(--text)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('pointer-events', 'none')
      .attr('opacity', 0)

    const hoverDot = g
      .append('circle')
      .attr('r', 3.5)
      .attr('fill', '#3b82f6')
      .attr('pointer-events', 'none')
      .attr('opacity', 0)

    const hoverText = g
      .append('text')
      .style('font-size', '11px')
      .attr('fill', 'var(--text-h)')
      .attr('pointer-events', 'none')
      .attr('opacity', 0)

    const bisect = d3.bisector((d: { time: number; value: number }) => d.time).left

    // Invisible overlay that captures mouse events
    g.append('rect')
      .attr('width', IW)
      .attr('height', IH)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mousemove', (event: MouseEvent) => {
        const data = displayDataRef.current
        const xS = xScaleRef.current
        const yS = yScaleRef.current
        if (!data.length || !xS || !yS) return

        const [mx] = d3.pointer(event)
        const t = xS.invert(mx)
        const i = bisect(data, t)
        const lo = data[Math.max(0, i - 1)]
        const hi = data[Math.min(data.length - 1, i)]
        const pt = !hi || Math.abs(t - lo.time) <= Math.abs(t - hi.time) ? lo : hi
        if (!pt) return

        const px = xS(pt.time)
        const py = yS(pt.value)
        const right = px > IW * 0.65

        hoverLine.attr('x1', px).attr('x2', px).attr('opacity', 0.5)
        hoverDot.attr('cx', px).attr('cy', py).attr('opacity', 1)
        hoverText
          .attr('x', right ? px - 6 : px + 6)
          .attr('y', Math.max(14, py - 6))
          .attr('text-anchor', right ? 'end' : 'start')
          .attr('opacity', 1)
          .text(`${toDisplayTimeRef.current(pt.time)}: ${pt.value.toPrecision(4)}`)
      })
      .on('mouseleave', () => {
        hoverLine.attr('opacity', 0)
        hoverDot.attr('opacity', 0)
        hoverText.attr('opacity', 0)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartVar, model?.startTime, model?.endTime, isCFTime])

  // Update y-axis label text when units are fetched (async, may lag behind setup)
  useEffect(() => {
    if (yLabelRef.current) {
      yLabelRef.current.textContent = varMeta[chartVar]?.units ?? ''
    }
  }, [varMeta, chartVar])

  // Stream data into the chart — O(new points) when y domain doesn't expand
  useEffect(() => {
    const xScale = xScaleRef.current
    const yScale = yScaleRef.current
    const linePath = linePathRef.current
    if (!xScale || !yScale || !linePath) return

    if (displayData.length === 0) {
      linePath.setAttribute('d', '')
      prevDataLenRef.current = 0
      yExtentRef.current = null
      return
    }

    const isAppend = displayData.length > prevDataLenRef.current && prevDataLenRef.current > 0

    // Reset y extent on non-append renders (variable change, index change, first render)
    if (!isAppend) yExtentRef.current = null

    const newPoints = isAppend ? displayData.slice(prevDataLenRef.current) : displayData
    const newMin = d3.min(newPoints, d => d.value) ?? 0
    const newMax = d3.max(newPoints, d => d.value) ?? 0
    const [prevMin, prevMax] = yExtentRef.current ?? [Infinity, -Infinity]
    const yMin = Math.min(prevMin, newMin)
    const yMax = Math.max(prevMax, newMax)
    const yExpanded = yExtentRef.current === null || yMin < prevMin || yMax > prevMax

    yExtentRef.current = [yMin, yMax]

    if (yExpanded) {
      const range = yMax - yMin || 1
      const pad = range * 0.05
      yScale.domain([yMin - pad, yMax + pad]).nice()
      if (yAxisGroupRef.current) updateYAxis(yAxisGroupRef.current, yScale)
      if (yGridGroupRef.current) updateYGrid(yGridGroupRef.current, yScale)
      linePath.setAttribute('d', buildFullPath(displayData, xScale, yScale))
    } else if (isAppend) {
      // Only compute the new path segments — O(new points)
      const segments = newPoints
        .map(d => ` L ${xScale(d.time).toFixed(1)} ${yScale(d.value).toFixed(1)}`)
        .join('')
      linePath.setAttribute('d', (linePath.getAttribute('d') ?? '') + segments)
    } else {
      linePath.setAttribute('d', buildFullPath(displayData, xScale, yScale))
    }

    prevDataLenRef.current = displayData.length
  }, [displayData])

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
      {chartVar && (
        <svg
          ref={svgRef}
          style={{ width: '100%', display: displayData.length === 0 ? 'none' : 'block' }}
          aria-label={`Time series plot of ${chartVar}`}
        />
      )}
    </section>
  )
}

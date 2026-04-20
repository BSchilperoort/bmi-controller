// ─── Types ────────────────────────────────────────────

export interface UniformRectilinearGrid {
  type: 'uniform_rectilinear'
  rank: number
  shape: number[]    // [rows, cols] for 2D
  spacing: number[]  // [dy, dx] for 2D
  origin: number[]   // [y0, x0] for 2D
}

export interface RectilinearGrid {
  type: 'rectilinear'
  rank: number
  shape: number[]
  x: number[]  // column x-coordinates (length = ncols)
  y: number[]  // row y-coordinates (length = nrows)
}

export interface StructuredQuadGrid {
  type: 'structured_quadrilateral'
  rank: number
  shape: number[]
  x: number[]  // all node x-coords, row-major (length = rows*cols)
  y: number[]  // all node y-coords, row-major (length = rows*cols)
}

export interface UnstructuredGrid {
  type: 'unstructured'
  rank: number
  nodeCount: number
  edgeCount: number
  faceCount: number
  x: number[]
  y: number[]
  edgeNodes: number[] | null
  faceNodes: number[] | null
  nodesPerFace: number[] | null
}

export type GridData =
  | UniformRectilinearGrid
  | RectilinearGrid
  | StructuredQuadGrid
  | UnstructuredGrid

export interface GridViewProps {
  data: GridData
  values?: number[]
  showFaces?: boolean
  showEdges?: boolean
  showNodes?: boolean
}

// ─── Layout ───────────────────────────────────────────

const W = 620, H = 370
const PL = 40, PT = 16, PB = 28, PR = 66   // left/top/bottom/right padding
const X1 = PL, X2 = W - PR
const Y1 = PT, Y2 = H - PB
const CBAR_X = W - PR + 10                 // color bar left edge

// ─── Helpers ──────────────────────────────────────────

function lerp(v: number, d0: number, d1: number, r0: number, r1: number) {
  if (d0 === d1) return (r0 + r1) / 2
  return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)
}

function makeMappers(xs: number[], ys: number[]) {
  const vxs = xs.filter(isFinite), vys = ys.filter(isFinite)
  const xMin = Math.min(...vxs), xMax = Math.max(...vxs)
  const yMin = Math.min(...vys), yMax = Math.max(...vys)
  return {
    mx: (v: number) => lerp(v, xMin, xMax === xMin ? xMin + 1 : xMax, X1, X2),
    my: (v: number) => lerp(v, yMin, yMax === yMin ? yMin + 1 : yMax, Y2, Y1), // flip y
    xMin, xMax, yMin, yMax,
  }
}

function subsampleArr(arr: number[], max: number): number[] {
  if (arr.length <= max) return arr
  const step = Math.ceil(arr.length / max)
  const out: number[] = []
  for (let i = 0; i < arr.length; i += step) out.push(arr[i])
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1])
  return out
}

function subsampleLinear(min: number, max: number, count: number, maxLines: number): number[] {
  if (!isFinite(min) || !isFinite(max)) return []
  const delta = count <= 1 ? 0 : (max - min) / (count - 1)
  return subsampleArr(Array.from({ length: count }, (_, i) => min + i * delta), maxLines)
}

function hsl(t: number) {
  return `hsl(${(240 * (1 - Math.max(0, Math.min(1, t)))).toFixed(1)},85%,55%)`
}

function fmtN(v: number) {
  if (v === 0) return '0'
  const abs = Math.abs(v)
  return abs >= 1e4 || abs < 0.01 ? v.toExponential(2) : v.toPrecision(3)
}

function valToT(v: number, vMin: number, vMax: number) {
  return vMax === vMin ? 0.5 : (v - vMin) / (vMax - vMin)
}

function minMax(arr: number[]) {
  let lo = arr[0], hi = arr[0]
  for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v }
  return { lo, hi }
}

const MAX_CELLS = 6000

// ─── Color bar ────────────────────────────────────────

function ColorBar({ vMin, vMax }: { vMin: number; vMax: number }) {
  return (
    <>
      <defs>
        <linearGradient id="cbar-g" x1="0" y1="1" x2="0" y2="0">
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <stop key={t} offset={`${t * 100}%`} stopColor={hsl(t)} />
          ))}
        </linearGradient>
      </defs>
      <rect x={CBAR_X} y={Y1} width={14} height={Y2 - Y1} fill="url(#cbar-g)" stroke="var(--border)" strokeWidth={0.5} />
      <text x={CBAR_X + 18} y={Y1 + 5} fontSize={9} fill="var(--text)">{fmtN(vMax)}</text>
      <text x={CBAR_X + 18} y={Y2}     fontSize={9} fill="var(--text)">{fmtN(vMin)}</text>
    </>
  )
}

// ─── Axis labels ──────────────────────────────────────

function AxisLabels({ xLabel, yLabel }: { xLabel: string; yLabel: string }) {
  const cx = (X1 + X2) / 2, cy = (Y1 + Y2) / 2
  return (
    <>
      <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--text)">{xLabel}</text>
      <text x={12} y={cy} textAnchor="middle" fontSize={10} fill="var(--text)"
        transform={`rotate(-90,12,${cy})`}>{yLabel}</text>
    </>
  )
}

// ─── Uniform rectilinear ──────────────────────────────

function UniformRectilinearView({ g, values }: { g: UniformRectilinearGrid; values?: number[] }) {
  const n = g.rank
  const ncols = g.shape[n - 1] ?? 1, nrows = g.shape[n - 2] ?? 1
  const x0 = g.origin[n - 1] ?? 0,  y0 = g.origin[n - 2] ?? 0
  const dx = g.spacing[n - 1] ?? 1,  dy = g.spacing[n - 2] ?? 1
  const xMax = x0 + (ncols - 1) * dx, yMax = y0 + (nrows - 1) * dy

  const mx = (v: number) => lerp(v, x0, xMax === x0 ? x0 + 1 : xMax, X1, X2)
  const my = (v: number) => lerp(v, y0, yMax === y0 ? y0 + 1 : yMax, Y2, Y1)

  const cellRows = nrows - 1, cellCols = ncols - 1
  const nodeCenter = values?.length === nrows * ncols
  const cellCenter = values?.length === cellRows * cellCols

  const colorResult = (values && values.length > 0 && cellRows > 0 && cellCols > 0 && (nodeCenter || cellCenter))
    ? (() => {
        const { lo: vMin, hi: vMax } = minMax(values)
        const step = Math.max(1, Math.ceil(Math.sqrt((cellRows * cellCols) / MAX_CELLS)))
        const cells = []
        for (let i = 0; i < cellRows; i += step) {
          for (let j = 0; j < cellCols; j += step) {
            const iEnd = Math.min(i + step, cellRows), jEnd = Math.min(j + step, cellCols)
            let sum = 0, cnt = 0
            for (let ii = i; ii < iEnd; ii++) {
              for (let jj = j; jj < jEnd; jj++) {
                sum += nodeCenter
                  ? (values[ii * ncols + jj] + values[ii * ncols + jj + 1] +
                     values[(ii + 1) * ncols + jj] + values[(ii + 1) * ncols + jj + 1]) / 4
                  : values[ii * cellCols + jj]
                cnt++
              }
            }
            cells.push(
              <rect key={`${i}_${j}`}
                x={mx(x0 + j * dx)} y={my(y0 + iEnd * dy)}
                width={mx(x0 + jEnd * dx) - mx(x0 + j * dx)}
                height={my(y0 + i * dy) - my(y0 + iEnd * dy)}
                fill={hsl(valToT(sum / cnt, vMin, vMax))}
              />
            )
          }
        }
        return { cells, vMin, vMax }
      })()
    : null

  const xLines = subsampleLinear(x0, xMax, ncols, 60)
  const yLines = subsampleLinear(y0, yMax, nrows, 60)
  const [svgX1, svgX2, svgY1, svgY2] = [mx(x0), mx(xMax), my(yMax), my(y0)]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {!colorResult && <rect x={svgX1} y={svgY1} width={svgX2 - svgX1} height={svgY2 - svgY1} fill="var(--accent-bg)" />}
      {colorResult?.cells}
      {xLines.map((x, i) => <line key={i} x1={mx(x)} y1={svgY1} x2={mx(x)} y2={svgY2} stroke="var(--border)" strokeWidth={colorResult ? 0.15 : 0.6} />)}
      {yLines.map((y, i) => <line key={i} x1={svgX1} y1={my(y)} x2={svgX2} y2={my(y)} stroke="var(--border)" strokeWidth={colorResult ? 0.15 : 0.6} />)}
      <rect x={svgX1} y={svgY1} width={svgX2 - svgX1} height={svgY2 - svgY1} fill="none" stroke="var(--text-h)" strokeWidth={1} />
      {colorResult && <ColorBar vMin={colorResult.vMin} vMax={colorResult.vMax} />}
      <AxisLabels xLabel={`x   ${ncols} nodes, Δx = ${dx}`} yLabel={`y   ${nrows} nodes, Δy = ${dy}`} />
    </svg>
  )
}

// ─── Rectilinear ──────────────────────────────────────

function RectilinearView({ g, values }: { g: RectilinearGrid; values?: number[] }) {
  const xs = g.x.filter(isFinite), ys = g.y.filter(isFinite)
  if (xs.length === 0 || ys.length === 0) return <p className="chart-empty">No coordinate data.</p>

  const ncols = xs.length, nrows = ys.length
  const xMin = xs[0], xMax = xs[ncols - 1], yMin = ys[0], yMax = ys[nrows - 1]
  const mx = (v: number) => lerp(v, xMin, xMax === xMin ? xMin + 1 : xMax, X1, X2)
  const my = (v: number) => lerp(v, yMin, yMax === yMin ? yMin + 1 : yMax, Y2, Y1)

  const cellRows = nrows - 1, cellCols = ncols - 1
  const nodeCenter = values?.length === nrows * ncols
  const cellCenter = values?.length === cellRows * cellCols

  const colorResult = (values && values.length > 0 && cellRows > 0 && cellCols > 0 && (nodeCenter || cellCenter))
    ? (() => {
        const { lo: vMin, hi: vMax } = minMax(values)
        const cells = []
        for (let i = 0; i < cellRows; i++) {
          for (let j = 0; j < cellCols; j++) {
            const v = nodeCenter
              ? (values[i * ncols + j] + values[i * ncols + j + 1] +
                 values[(i + 1) * ncols + j] + values[(i + 1) * ncols + j + 1]) / 4
              : values[i * cellCols + j]
            cells.push(
              <rect key={`${i}_${j}`}
                x={mx(xs[j])} y={my(ys[i + 1])}
                width={mx(xs[j + 1]) - mx(xs[j])}
                height={my(ys[i]) - my(ys[i + 1])}
                fill={hsl(valToT(v, vMin, vMax))}
              />
            )
          }
        }
        return { cells, vMin, vMax }
      })()
    : null

  const dispXs = subsampleArr(xs, 60), dispYs = subsampleArr(ys, 60)
  const [svgX1, svgX2, svgY1, svgY2] = [mx(xMin), mx(xMax), my(yMax), my(yMin)]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {!colorResult && <rect x={svgX1} y={svgY1} width={svgX2 - svgX1} height={svgY2 - svgY1} fill="var(--accent-bg)" />}
      {colorResult?.cells}
      {dispXs.map((x, i) => <line key={i} x1={mx(x)} y1={svgY1} x2={mx(x)} y2={svgY2} stroke="var(--border)" strokeWidth={colorResult ? 0.15 : 0.6} />)}
      {dispYs.map((y, i) => <line key={i} x1={svgX1} y1={my(y)} x2={svgX2} y2={my(y)} stroke="var(--border)" strokeWidth={colorResult ? 0.15 : 0.6} />)}
      <rect x={svgX1} y={svgY1} width={svgX2 - svgX1} height={svgY2 - svgY1} fill="none" stroke="var(--text-h)" strokeWidth={1} />
      {colorResult && <ColorBar vMin={colorResult.vMin} vMax={colorResult.vMax} />}
      <AxisLabels xLabel={`x   ${ncols} columns`} yLabel={`y   ${nrows} rows`} />
    </svg>
  )
}

// ─── Structured quadrilateral ─────────────────────────

const MAX_NODES_FULL = 100000

function StructuredQuadView({ g, values, showFaces, showEdges, showNodes }: { g: StructuredQuadGrid; values?: number[] } & Pick<GridViewProps, 'showFaces' | 'showEdges' | 'showNodes'>) {
  const nrows = g.shape[g.shape.length - 2] ?? 1
  const ncols = g.shape[g.shape.length - 1] ?? 1
  const { x: xs, y: ys } = g

  if (xs.length === 0) return <p className="chart-empty">No coordinate data.</p>

  const { mx, my, xMin, xMax, yMin, yMax } = makeMappers(xs, ys)
  if (xs.length > MAX_NODES_FULL) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        <rect x={X1} y={Y1} width={X2 - X1} height={Y2 - Y1} fill="var(--accent-bg)" stroke="var(--text-h)" strokeWidth={1} />
        <text x={(X1 + X2) / 2} y={(Y1 + Y2) / 2 - 8} textAnchor="middle" fontSize={12} fill="var(--text-h)">{nrows} × {ncols} nodes</text>
        <text x={(X1 + X2) / 2} y={(Y1 + Y2) / 2 + 12} textAnchor="middle" fontSize={11} fill="var(--text)">Too many nodes to render</text>
        <AxisLabels xLabel={`x   [${xMin.toPrecision(4)}, ${xMax.toPrecision(4)}]`} yLabel={`y   [${yMin.toPrecision(4)}, ${yMax.toPrecision(4)}]`} />
      </svg>
    )
  }

  const nodeCenter = values?.length === nrows * ncols
  const faceCenter = values?.length === (nrows - 1) * (ncols - 1)
  const colorRange = (values && values.length > 0 && (nodeCenter || faceCenter))
    ? minMax(values) : null

  const facePolys = []
  if (showFaces !== false) {
    for (let i = 0; i < nrows - 1; i++) {
      for (let j = 0; j < ncols - 1; j++) {
        const a = i * ncols + j, b = i * ncols + j + 1
        const c = (i + 1) * ncols + j + 1, d = (i + 1) * ncols + j
        let fill = 'var(--accent-bg)'
        if (colorRange) {
          const v = nodeCenter
            ? (values![a] + values![b] + values![c] + values![d]) / 4
            : values![(i * (ncols - 1)) + j]
          fill = hsl(valToT(v, colorRange.lo, colorRange.hi))
        }
        facePolys.push(
          <polygon key={`f${i}_${j}`}
            points={`${mx(xs[a])},${my(ys[a])} ${mx(xs[b])},${my(ys[b])} ${mx(xs[c])},${my(ys[c])} ${mx(xs[d])},${my(ys[d])}`}
            fill={fill} stroke={showEdges === false ? 'none' : 'var(--border)'} strokeWidth={0.5}
          />
        )
      }
    }
  }

  const edgeLines = []
  if (showEdges !== false && showFaces === false) {
    for (let i = 0; i < nrows; i++)
      for (let j = 0; j < ncols - 1; j++) {
        const a = i * ncols + j, b = a + 1
        edgeLines.push(<line key={`h${i}_${j}`} x1={mx(xs[a])} y1={my(ys[a])} x2={mx(xs[b])} y2={my(ys[b])} stroke="#3b82f6" strokeWidth={0.8} />)
      }
    for (let i = 0; i < nrows - 1; i++)
      for (let j = 0; j < ncols; j++) {
        const a = i * ncols + j, b = a + ncols
        edgeLines.push(<line key={`v${i}_${j}`} x1={mx(xs[a])} y1={my(ys[a])} x2={mx(xs[b])} y2={my(ys[b])} stroke="#3b82f6" strokeWidth={0.8} />)
      }
  }

  const nodeDots = showNodes !== false
    ? xs.map((x, i) => {
        let fill = '#ef4444'
        if (colorRange && nodeCenter) fill = hsl(valToT(values![i], colorRange.lo, colorRange.hi))
        return <circle key={i} cx={mx(x)} cy={my(ys[i])} r={2.5} fill={fill} />
      })
    : []

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {facePolys}{edgeLines}{nodeDots}
      {colorRange && <ColorBar vMin={colorRange.lo} vMax={colorRange.hi} />}
      <AxisLabels xLabel={`x   ${ncols} cols`} yLabel={`y   ${nrows} rows`} />
    </svg>
  )
}

// ─── Unstructured ─────────────────────────────────────

function UnstructuredView({ g, values, showFaces, showEdges, showNodes }: { g: UnstructuredGrid; values?: number[] } & Pick<GridViewProps, 'showFaces' | 'showEdges' | 'showNodes'>) {
  const { x: xs, y: ys } = g
  if (xs.length === 0) return <p className="chart-empty">No coordinate data.</p>

  const { mx, my, xMin, xMax, yMin, yMax } = makeMappers(xs, ys)
  if (g.nodeCount > MAX_NODES_FULL) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        <rect x={X1} y={Y1} width={X2 - X1} height={Y2 - Y1} fill="var(--accent-bg)" stroke="var(--text-h)" strokeWidth={1} />
        <text x={(X1 + X2) / 2} y={(Y1 + Y2) / 2 - 8} textAnchor="middle" fontSize={12} fill="var(--text-h)">{g.nodeCount} nodes · {g.edgeCount} edges · {g.faceCount} faces</text>
        <text x={(X1 + X2) / 2} y={(Y1 + Y2) / 2 + 12} textAnchor="middle" fontSize={11} fill="var(--text)">Too many nodes to render</text>
        <AxisLabels xLabel="x" yLabel="y" />
      </svg>
    )
  }

  const nodeCenter = values?.length === g.nodeCount
  const faceCenter = values?.length === g.faceCount
  const colorRange = (values && values.length > 0 && (nodeCenter || faceCenter))
    ? minMax(values) : null

  const facePolys = []
  if (showFaces !== false && g.faceNodes && g.nodesPerFace) {
    let offset = 0
    for (let fi = 0; fi < g.nodesPerFace.length; fi++) {
      const count = g.nodesPerFace[fi]
      const nodeIdxs = g.faceNodes.slice(offset, offset + count)
      const pts = nodeIdxs.map(ni => `${mx(xs[ni])},${my(ys[ni])}`).join(' ')
      let fill = 'var(--accent-bg)'
      if (colorRange) {
        const v = nodeCenter
          ? nodeIdxs.reduce((s, ni) => s + values![ni], 0) / nodeIdxs.length
          : values![fi]
        fill = hsl(valToT(v, colorRange.lo, colorRange.hi))
      }
      facePolys.push(
        <polygon key={fi} points={pts} fill={fill}
          stroke={showEdges === false ? 'none' : 'var(--border)'} strokeWidth={0.5} />
      )
      offset += count
    }
  }

  const edgeLines = []
  if (showEdges !== false && g.edgeNodes && showFaces === false) {
    for (let i = 0; i < g.edgeNodes.length - 1; i += 2) {
      const a = g.edgeNodes[i], b = g.edgeNodes[i + 1]
      edgeLines.push(<line key={i} x1={mx(xs[a])} y1={my(ys[a])} x2={mx(xs[b])} y2={my(ys[b])} stroke="#3b82f6" strokeWidth={0.8} />)
    }
  }

  const nodeDots = showNodes !== false
    ? xs.map((x, i) => {
        let fill = '#ef4444'
        if (colorRange && nodeCenter) fill = hsl(valToT(values![i], colorRange.lo, colorRange.hi))
        return <circle key={i} cx={mx(x)} cy={my(ys[i])} r={3} fill={fill} />
      })
    : []

  const legend: { color: string; label: string }[] = []
  if (!colorRange) {
    if (showFaces !== false) legend.push({ color: 'var(--accent-bg)', label: 'faces' })
    if (showEdges !== false) legend.push({ color: '#3b82f6', label: 'edges' })
    if (showNodes !== false) legend.push({ color: '#ef4444', label: 'nodes' })
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {facePolys}{edgeLines}{nodeDots}
      {colorRange && <ColorBar vMin={colorRange.lo} vMax={colorRange.hi} />}
      {legend.map((item, i) => (
        <g key={item.label} transform={`translate(${X2 - 160 + i * 56}, ${H - 10})`}>
          <rect x={0} y={-9} width={11} height={11} fill={item.color} stroke="var(--border)" strokeWidth={0.5} />
          <text x={14} y={1} fontSize={10} fill="var(--text)">{item.label}</text>
        </g>
      ))}
      <AxisLabels xLabel={`x   [${xMin.toPrecision(4)}, ${xMax.toPrecision(4)}]`} yLabel={`y   [${yMin.toPrecision(4)}, ${yMax.toPrecision(4)}]`} />
    </svg>
  )
}

// ─── Public component ─────────────────────────────────

export function GridView({ data, values, showFaces = true, showEdges = true, showNodes = true }: GridViewProps) {
  if (data.rank < 2) {
    return <p className="chart-empty">Grid rank is {data.rank} — no 2D view available.</p>
  }
  switch (data.type) {
    case 'uniform_rectilinear':
      return <UniformRectilinearView g={data} values={values} />
    case 'rectilinear':
      return <RectilinearView g={data} values={values} />
    case 'structured_quadrilateral':
      return <StructuredQuadView g={data} values={values} showFaces={showFaces} showEdges={showEdges} showNodes={showNodes} />
    case 'unstructured':
      return <UnstructuredView g={data} values={values} showFaces={showFaces} showEdges={showEdges} showNodes={showNodes} />
  }
}

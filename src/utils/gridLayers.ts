import type { GridData } from '../components/GridView.tsx'

// Structured grids of rank ≥ 3 (shape [..., nz, ny, nx]) are shown one 2D
// layer at a time. All leading dimensions are flattened into a layer index.
export interface LayerInfo {
  count: number         // number of selectable layers
  perLayer: number      // values per layer
  cellCentered: boolean // values are on cells (nz-1 layers) rather than nodes
}

export function getLayerInfo(data: GridData, values?: number[] | null): LayerInfo | null {
  if (data.type === 'unstructured' || data.rank < 3) return null
  const n = data.shape.length
  const ny = data.shape[n - 2] ?? 1, nx = data.shape[n - 1] ?? 1
  const nLead = data.shape.slice(0, n - 2).reduce((a, b) => a * b, 1)
  const nodes = ny * nx, cells = (ny - 1) * (nx - 1)
  if (data.rank === 3 && nLead > 1 && cells > 0 && values?.length === (nLead - 1) * cells) {
    return { count: nLead - 1, perLayer: cells, cellCentered: true }
  }
  return { count: nLead, perLayer: nodes, cellCentered: false }
}

// z-coordinate of a layer, if known
export function layerZ(data: GridData, info: LayerInfo, layer: number): number | null {
  if (data.rank !== 3) return null
  const off = info.cellCentered ? 0.5 : 0
  if (data.type === 'uniform_rectilinear') {
    const z0 = data.origin[0], dz = data.spacing[0]
    return z0 != null && dz != null ? z0 + (layer + off) * dz : null
  }
  if (data.type === 'rectilinear' && data.z && data.z.length > layer + (info.cellCentered ? 1 : 0)) {
    return info.cellCentered ? (data.z[layer] + data.z[layer + 1]) / 2 : data.z[layer]
  }
  return null
}

export function sliceLayer(data: GridData, values: number[] | undefined, info: LayerInfo, layer: number): { data: GridData; values?: number[] } {
  if (data.type === 'unstructured') return { data, values }
  const sliced = values?.slice(layer * info.perLayer, (layer + 1) * info.perLayer)
  const shape2 = data.shape.slice(-2)
  switch (data.type) {
    case 'uniform_rectilinear':
      return { data: { ...data, rank: 2, shape: shape2, spacing: data.spacing.slice(-2), origin: data.origin.slice(-2) }, values: sliced }
    case 'rectilinear':
      return { data: { ...data, rank: 2, shape: shape2 }, values: sliced }
    case 'structured_quadrilateral': {
      // Node coordinates are given for every node; take the layer's (bottom) node plane
      const nodes = shape2[0] * shape2[1]
      const s = layer * nodes, e = s + nodes
      return { data: { ...data, rank: 2, shape: shape2, x: data.x.slice(s, e), y: data.y.slice(s, e) }, values: sliced }
    }
  }
}

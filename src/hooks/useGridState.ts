import { useRef, useState } from 'react'
import { client } from '../api/client.ts'
import { type GridData } from '../components/GridView.tsx'
import { getErrorMessage } from '../utils/index.ts'

interface Params {
  availableGrids: Map<number, string>
  setError: (msg: string | null) => void
}

export function useGridState({ availableGrids, setError }: Params) {
  const [selectedGridId, setSelectedGridId] = useState<number | null>(null)
  const [gridData, setGridData] = useState<GridData | null>(null)
  const [loadingGrid, setLoadingGrid] = useState(false)
  const [gridVar, setGridVar] = useState('')
  const [gridVarValues, setGridVarValues] = useState<number[] | null>(null)
  const [gridShowFaces, setGridShowFaces] = useState(true)
  const [gridShowEdges, setGridShowEdges] = useState(true)
  const [gridShowNodes, setGridShowNodes] = useState(true)

  const gridVarRef = useRef(gridVar)
  gridVarRef.current = gridVar

  async function selectGridVar(name: string, keepExisting = false) {
    setGridVar(name)
    if (!keepExisting) setGridVarValues(null)
    if (!name) return
    try {
      const { data } = await client.GET('/get_value/{name}', { params: { path: { name } } })
      if (data != null) {
        setGridVarValues(Array.isArray(data) ? data : [data as unknown as number])
      }
    } catch { /* non-critical */ }
  }

  async function selectGrid(id: number | null) {
    setSelectedGridId(id)
    setGridData(null)
    setGridVar('')
    setGridVarValues(null)
    if (id === null) return
    const typeStr = availableGrids.get(id) ?? 'unknown'
    setLoadingGrid(true)
    try {
      const rankRes = await client.GET('/get_grid_rank/{grid}', { params: { path: { grid: id } } })
      const rank = rankRes.data ?? 0

      if (typeStr === 'uniform_rectilinear') {
        const [shapeRes, spacingRes, originRes] = await Promise.all([
          client.GET('/get_grid_shape/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_spacing/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_origin/{grid}', { params: { path: { grid: id } } }),
        ])
        setGridData({
          type: 'uniform_rectilinear', rank,
          shape: shapeRes.data ?? [], spacing: spacingRes.data ?? [], origin: originRes.data ?? [],
        })
      } else if (typeStr === 'rectilinear') {
        const [shapeRes, xRes, yRes] = await Promise.all([
          client.GET('/get_grid_shape/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_x/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_y/{grid}', { params: { path: { grid: id } } }),
        ])
        setGridData({
          type: 'rectilinear', rank,
          shape: shapeRes.data ?? [], x: xRes.data ?? [], y: yRes.data ?? [],
        })
      } else if (typeStr === 'structured_quadrilateral') {
        const [shapeRes, xRes, yRes] = await Promise.all([
          client.GET('/get_grid_shape/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_x/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_y/{grid}', { params: { path: { grid: id } } }),
        ])
        setGridData({
          type: 'structured_quadrilateral', rank,
          shape: shapeRes.data ?? [], x: xRes.data ?? [], y: yRes.data ?? [],
        })
      } else if (typeStr === 'unstructured') {
        const [nodeCountRes, edgeCountRes, faceCountRes, xRes, yRes] = await Promise.all([
          client.GET('/get_grid_node_count/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_edge_count/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_face_count/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_x/{grid}', { params: { path: { grid: id } } }),
          client.GET('/get_grid_y/{grid}', { params: { path: { grid: id } } }),
        ])
        const nodeCount = nodeCountRes.data ?? 0
        const edgeCount = edgeCountRes.data ?? 0
        const faceCount = faceCountRes.data ?? 0
        let edgeNodes: number[] | null = null
        let faceNodes: number[] | null = null
        let nodesPerFace: number[] | null = null
        if (edgeCount > 0) {
          const r = await client.GET('/get_grid_edge_nodes/{grid}', { params: { path: { grid: id } } })
          edgeNodes = r.data ?? null
        }
        if (faceCount > 0) {
          const [fnRes, npfRes] = await Promise.all([
            client.GET('/get_grid_face_nodes/{grid}', { params: { path: { grid: id } } }),
            client.GET('/get_grid_nodes_per_face/{grid}', { params: { path: { grid: id } } }),
          ])
          faceNodes = fnRes.data ?? null
          nodesPerFace = npfRes.data ?? null
        }
        setGridData({
          type: 'unstructured', rank, nodeCount, edgeCount, faceCount,
          x: xRes.data ?? [], y: yRes.data ?? [], edgeNodes, faceNodes, nodesPerFace,
        })
      }
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setLoadingGrid(false)
    }
  }

  return {
    selectedGridId,
    gridData,
    loadingGrid,
    gridVar, gridVarRef,
    gridVarValues,
    gridShowFaces, setGridShowFaces,
    gridShowEdges, setGridShowEdges,
    gridShowNodes, setGridShowNodes,
    selectGrid,
    selectGridVar,
  }
}

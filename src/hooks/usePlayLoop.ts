import { useRef, useState } from 'react'
import { client } from '../api/client.ts'
import type { ModelState } from '../interfaces/index.ts'
import { getErrorMessage } from '../utils/index.ts'

interface Params {
  model: ModelState | null
  startOp: (key: string) => void
  endOp: (key: string) => void
  setError: (msg: string | null) => void
  setValidPrefills: (v: Set<string>) => void
  prefillInputVar: (name: string) => Promise<void>
  selectGridVar: (name: string, keepExisting?: boolean) => Promise<void>
  recordChartPoint: (time: number, varName: string) => Promise<void>
  refreshCurrentTime: () => Promise<number | null>
  selectedInputVarRef: { current: string }
  gridVarRef: { current: string }
  chartVarRef: { current: string }
}

export function usePlayLoop({
  model, startOp, endOp, setError,
  setValidPrefills,
  prefillInputVar, selectGridVar, recordChartPoint, refreshCurrentTime,
  selectedInputVarRef, gridVarRef, chartVarRef,
}: Params) {
  const [playing, setPlaying] = useState(false)
  const [updateUntilTime, setUpdateUntilTime] = useState('')
  const playingRef = useRef(false)
  const loopRunningRef = useRef(false)

  async function afterStep(newTime: number | null) {
    setValidPrefills(new Set())
    await prefillInputVar(selectedInputVarRef.current)
    await selectGridVar(gridVarRef.current, true)
    if (newTime !== null) await recordChartPoint(newTime, chartVarRef.current)
  }

  async function play() {
    if (!model || loopRunningRef.current) return
    const endTime = model.endTime
    setPlaying(true)
    playingRef.current = true
    loopRunningRef.current = true
    setError(null)
    try {
      while (playingRef.current) {
        const { error: err } = await client.POST('/update')
        if (err) { setError(getErrorMessage(err)); break }
        if (!playingRef.current) break
        const newTime = await refreshCurrentTime()
        await afterStep(newTime)
        if (newTime === null || !playingRef.current) break
        if (newTime >= endTime) break
      }
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setPlaying(false)
      playingRef.current = false
      loopRunningRef.current = false
    }
  }

  function pause() {
    playingRef.current = false
    setPlaying(false)
  }

  async function update() {
    setError(null)
    startOp('update')
    try {
      const { error: err } = await client.POST('/update')
      if (err) { setError(getErrorMessage(err)); return }
      const newTime = await refreshCurrentTime()
      await afterStep(newTime)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      endOp('update')
    }
  }

  async function updateUntil() {
    const t = parseFloat(updateUntilTime)
    if (isNaN(t)) { setError('Enter a valid time value'); return }
    setError(null)
    startOp('updateUntil')
    try {
      const { error: err } = await client.POST('/update_until', { body: t })
      if (err) { setError(getErrorMessage(err)); return }
      const newTime = await refreshCurrentTime()
      await afterStep(newTime)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      endOp('updateUntil')
    }
  }

  return {
    playing,
    updateUntilTime, setUpdateUntilTime,
    play, pause,
    update, updateUntil,
  }
}

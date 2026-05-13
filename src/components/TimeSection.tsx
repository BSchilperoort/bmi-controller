import type { Phase, ModelState } from '../interfaces/index.ts'

interface TimeSectionProps {
  model: ModelState | null
  toDisplayTime: (v: number) => string
  progress: number
  isRunning: boolean
  playing: boolean
  phase: Phase
  atEnd: boolean
  ops: Record<string, boolean>
  updateUntilTime: string
  onUpdateUntilTimeChange: (v: string) => void
  onStep: () => void
  onPlay: () => void
  onPause: () => void
  onRunUntil: () => void
  onFinalize: () => void
}

export function TimeSection({
  model, toDisplayTime, progress, isRunning, playing, phase, atEnd, ops,
  updateUntilTime, onUpdateUntilTimeChange, onStep, onPlay, onPause, onRunUntil, onFinalize,
}: TimeSectionProps) {
  return (
    <section className="time-section">
      <div className="time-info">
        <span className="time-label">t</span>
        <span className="time-value">{model ? toDisplayTime(model.currentTime) : '—'}</span>
        <span className="time-sep">/</span>
        <span className="time-end">{model ? toDisplayTime(model.endTime) : '—'}</span>
        <span className="time-meta">step: {model?.timeStep}</span>
        <span className="time-meta">[{model?.timeUnits}]</span>
      </div>
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-fill" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
      <div className="controls">
        <button
          className="btn-primary"
          onClick={onStep}
          disabled={isRunning || phase === 'finalized' || atEnd}
        >
          {ops.update ? '…' : '▶ Step'}
        </button>
        <button
          className={playing ? 'btn-secondary' : 'btn-primary'}
          onClick={playing ? onPause : onPlay}
          disabled={!playing && (isRunning || phase === 'finalized' || atEnd)}
        >
          {playing ? '⏸ Pause' : '▶▶ Play'}
        </button>
        <div className="control-group">
          <input
            type="number"
            className="time-input"
            placeholder={`until (${model?.timeUnits ?? '?'})`}
            value={updateUntilTime}
            onChange={e => onUpdateUntilTimeChange(e.target.value)}
            disabled={isRunning || phase === 'finalized' || atEnd}
          />
          <button
            className="btn-secondary"
            onClick={onRunUntil}
            disabled={isRunning || phase === 'finalized' || !updateUntilTime || atEnd}
          >
            {ops.updateUntil ? '…' : '▶▶ Run Until'}
          </button>
        </div>
        <button
          className="btn-danger"
          onClick={onFinalize}
          disabled={ops.finalize || phase === 'finalized'}
        >
          {ops.finalize ? '…' : 'Finalize'}
        </button>
      </div>
    </section>
  )
}

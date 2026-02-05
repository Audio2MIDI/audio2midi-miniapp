import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Midi } from '@tonejs/midi'
import * as Tone from 'tone'

/* ── constants ── */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const MIN_PITCH = 21   // A0
const MAX_PITCH = 108  // C8
const PIANO_KEY_WIDTH = 56
const NOTE_HEIGHT_BASE = 14
const PIXELS_PER_SEC_BASE = 120
const API_BASE = '/api'  // Backend API base URL

function noteName(midi: number): string {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1)
}

function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12)
}

function velocityColor(velocity: number): string {
  // HSL gradient: low velocity = blue, high = red
  const hue = (1 - velocity) * 240 // 240 (blue) → 0 (red)
  const lightness = 40 + velocity * 20
  return `hsl(${hue}, 85%, ${lightness}%)`
}

interface MidiNote {
  pitch: number
  time: number
  duration: number
  velocity: number
  track: number
}

interface PianoRollProps {
  midiParam?: string | null  // MIDI ID to auto-load
  userId?: number | null     // User ID to load latest MIDI
  initData?: string | null   // Telegram initData for auth
}

/* ── component ── */
const PianoRoll: React.FC<PianoRollProps> = ({ midiParam, userId, initData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number>(0)

  const [midi, setMidi] = useState<Midi | null>(null)
  const [notes, setNotes] = useState<MidiNote[]>([])
  const [zoom, setZoom] = useState(1)
  const [scrollX, setScrollX] = useState(0)
  const [scrollY, setScrollY] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playStartTime, setPlayStartTime] = useState(0)
  const [playOffset, setPlayOffset] = useState(0)
  const [dragFile, setDragFile] = useState(false)
  const [duration, setDuration] = useState(0)
  const [fileName, setFileName] = useState('')
  
  // Auto-load states
  const [isAutoLoading, setIsAutoLoading] = useState(false)
  const [autoLoadError, setAutoLoadError] = useState<string | null>(null)

  const synthRef = useRef<Tone.PolySynth | null>(null)
  const scheduledRef = useRef<number[]>([])

  const noteHeight = NOTE_HEIGHT_BASE * zoom
  const pixelsPerSec = PIXELS_PER_SEC_BASE * zoom

  /* pitch range */
  const pitchRange = MAX_PITCH - MIN_PITCH + 1
  const totalHeight = pitchRange * noteHeight

  /* ── load midi ── */
  const loadMidi = useCallback((buffer: ArrayBuffer, name: string) => {
    try {
      const parsed = new Midi(buffer)
      setMidi(parsed)
      setFileName(name)

      const allNotes: MidiNote[] = []
      parsed.tracks.forEach((track, ti) => {
        track.notes.forEach(n => {
          allNotes.push({
            pitch: n.midi,
            time: n.time,
            duration: n.duration,
            velocity: n.velocity,
            track: ti,
          })
        })
      })
      setNotes(allNotes)

      const maxTime = allNotes.reduce((m, n) => Math.max(m, n.time + n.duration), 0)
      setDuration(maxTime)
      setScrollX(0)

      // center vertically on the note range
      if (allNotes.length > 0) {
        const minP = allNotes.reduce((m, n) => Math.min(m, n.pitch), 127)
        const maxP = allNotes.reduce((m, n) => Math.max(m, n.pitch), 0)
        const centerPitch = (minP + maxP) / 2
        const canvas = canvasRef.current
        if (canvas) {
          const yCenter = (MAX_PITCH - centerPitch) * noteHeight - canvas.height / 2
          setScrollY(Math.max(0, yCenter))
        }
      }

      stopPlayback()
    } catch (e) {
      console.error('Failed to parse MIDI:', e)
      alert('Не удалось прочитать MIDI файл')
    }
  }, [noteHeight])

  /* ── file input ── */
  const handleFile = useCallback((file: File) => {
    if (!file.name.match(/\.mid(i)?$/i)) {
      alert('Пожалуйста, загрузите .mid / .midi файл')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        loadMidi(reader.result, file.name)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [loadMidi])

  /* ── auto-load MIDI from API ── */
  useEffect(() => {
    // Need either midiParam or userId to auto-load
    if (!midiParam && !userId) return
    
    const loadFromApi = async () => {
      setIsAutoLoading(true)
      setAutoLoadError(null)
      
      try {
        const headers: Record<string, string> = {}
        if (initData) {
          headers['Authorization'] = `tma ${initData}`
        }
        
        // Build query: prioritize midi_id, fallback to user_id for latest
        const queryParam = midiParam 
          ? `midi_id=${encodeURIComponent(midiParam)}`
          : `user_id=${userId}`
        
        const response = await fetch(
          `${API_BASE}/latest-midi?${queryParam}`,
          { headers }
        )
        
        if (response.status === 404) {
          // No MIDI found — not an error, just show empty state
          console.log('No MIDI found for', midiParam || userId)
          return
        }
        
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.error || `HTTP ${response.status}`)
        }
        
        const data = await response.json()
        
        if (!data.ok || !data.data) {
          throw new Error(data.error || 'No MIDI data received')
        }
        
        // Decode base64 MIDI data
        const binaryString = atob(data.data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        
        loadMidi(bytes.buffer, data.filename || `${midiParam || 'latest'}.mid`)
      } catch (err) {
        console.error('Auto-load MIDI failed:', err)
        setAutoLoadError(err instanceof Error ? err.message : 'Failed to load MIDI')
      } finally {
        setIsAutoLoading(false)
      }
    }
    
    loadFromApi()
  }, [midiParam, userId, initData, loadMidi])

  /* ── playback ── */
  const startPlayback = useCallback(async () => {
    if (notes.length === 0) return

    await Tone.start()

    if (!synthRef.current) {
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' as const },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.3 },
        volume: -12,
      }).toDestination()
    }

    const synth = synthRef.current
    const now = Tone.now()

    // Schedule all notes
    const ids: number[] = []
    notes.forEach(n => {
      if (n.time + n.duration < playOffset) return
      const delay = Math.max(0, n.time - playOffset)
      const id = Tone.getTransport().scheduleOnce(() => {
        synth.triggerAttackRelease(
          Tone.Frequency(n.pitch, 'midi').toFrequency(),
          Math.min(n.duration, 4),
          undefined,
          n.velocity * 0.8
        )
      }, `+${delay}`)
      ids.push(id)
    })

    scheduledRef.current = ids
    setPlayStartTime(now - playOffset)
    setIsPlaying(true)
    Tone.getTransport().start()
  }, [notes, playOffset])

  const stopPlayback = useCallback(() => {
    setIsPlaying(false)
    Tone.getTransport().stop()
    Tone.getTransport().cancel()
    scheduledRef.current = []
    if (synthRef.current) {
      synthRef.current.releaseAll()
    }
    setPlayOffset(0)
  }, [])

  /* ── drawing ── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    // Use CSS pixels for coordinates (ctx.scale(dpr) is applied in resize)
    const W = canvas.width / dpr
    const H = canvas.height / dpr

    ctx.clearRect(0, 0, W, H)

    const nh = noteHeight
    const pps = pixelsPerSec
    const sx = scrollX
    const sy = scrollY

    /* ── piano keys (left panel) ── */
    const keyW = PIANO_KEY_WIDTH
    for (let p = MIN_PITCH; p <= MAX_PITCH; p++) {
      const y = (MAX_PITCH - p) * nh - sy
      if (y + nh < 0 || y > H) continue

      const black = isBlackKey(p)
      ctx.fillStyle = black ? '#1a1a28' : '#2a2a3e'
      ctx.fillRect(0, y, keyW, nh)
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.strokeRect(0, y, keyW, nh)

      // Label
      if (p % 12 === 0 || !black) {
        ctx.fillStyle = black ? '#888' : '#bbb'
        ctx.font = `${Math.max(9, nh * 0.65)}px monospace`
        ctx.textBaseline = 'middle'
        ctx.fillText(noteName(p), 4, y + nh / 2)
      }
    }

    /* ── grid area ── */
    ctx.save()
    ctx.beginPath()
    ctx.rect(keyW, 0, W - keyW, H)
    ctx.clip()

    // horizontal lines per pitch
    for (let p = MIN_PITCH; p <= MAX_PITCH; p++) {
      const y = (MAX_PITCH - p) * nh - sy
      if (y + nh < 0 || y > H) continue

      const black = isBlackKey(p)
      ctx.fillStyle = black ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)'
      ctx.fillRect(keyW, y, W - keyW, nh)

      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(keyW, y + nh)
      ctx.lineTo(W, y + nh)
      ctx.stroke()
    }

    // vertical grid lines (every second and every beat)
    const bpm = midi?.header?.tempos?.[0]?.bpm || 120
    const beatSec = 60 / bpm
    const barSec = beatSec * (midi?.header?.timeSignatures?.[0]?.timeSignature?.[0] || 4)

    const startSec = sx / pps
    const endSec = (sx + W - keyW) / pps

    // beat lines
    const firstBeat = Math.floor(startSec / beatSec)
    for (let i = firstBeat; i * beatSec <= endSec + beatSec; i++) {
      const t = i * beatSec
      const x = keyW + t * pps - sx
      if (x < keyW) continue

      const isBar = Math.abs(t % barSec) < 0.001 || Math.abs((t % barSec) - barSec) < 0.001
      ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'
      ctx.lineWidth = isBar ? 1.5 : 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()

      // bar number
      if (isBar) {
        const barNum = Math.round(t / barSec) + 1
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.font = '11px monospace'
        ctx.textBaseline = 'top'
        ctx.fillText(`${barNum}`, x + 3, 4)
      }
    }

    /* ── notes ── */
    for (const n of notes) {
      const x = keyW + n.time * pps - sx
      const w = n.duration * pps
      const y = (MAX_PITCH - n.pitch) * nh - sy

      // culling
      if (x + w < keyW || x > W || y + nh < 0 || y > H) continue

      const clampX = Math.max(x, keyW)
      const clampW = Math.min(x + w, W) - clampX

      ctx.fillStyle = velocityColor(n.velocity)
      ctx.beginPath()
      const r = Math.min(3, nh / 3)
      roundRect(ctx, clampX, y + 1, clampW, nh - 2, r)
      ctx.fill()

      // border
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'
      ctx.lineWidth = 0.5
      ctx.stroke()

      // note name inside if wide enough
      if (clampW > 28 && nh > 10) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.font = `${Math.min(10, nh - 4)}px monospace`
        ctx.textBaseline = 'middle'
        ctx.fillText(noteName(n.pitch), clampX + 3, y + nh / 2)
      }
    }

    /* ── playhead ── */
    if (isPlaying) {
      const elapsed = Tone.now() - playStartTime
      const px = keyW + elapsed * pps - sx
      if (px >= keyW && px <= W) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(px, 0)
        ctx.lineTo(px, H)
        ctx.stroke()

        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.moveTo(px - 5, 0)
        ctx.lineTo(px + 5, 0)
        ctx.lineTo(px, 8)
        ctx.fill()
      }
    }

    ctx.restore()

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(draw)
    }
  }, [notes, midi, zoom, scrollX, scrollY, noteHeight, pixelsPerSec, isPlaying, playStartTime])

  /* ── resize ── */
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = rect.width + 'px'
      canvas.style.height = rect.height + 'px'

      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  /* ── redraw on state change ── */
  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [draw])

  /* ── mouse/touch scroll ── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // zoom
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        setZoom(z => Math.max(0.3, Math.min(5, z * delta)))
      } else {
        setScrollX(sx => Math.max(0, sx + e.deltaX + (e.shiftKey ? e.deltaY : 0)))
        setScrollY(sy => {
          const maxSy = Math.max(0, totalHeight - canvas.height / (window.devicePixelRatio || 1))
          return Math.max(0, Math.min(maxSy, sy + (e.shiftKey ? 0 : e.deltaY)))
        })
      }
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [totalHeight])

  /* ── touch support with pinch-to-zoom ── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let lastTouchX = 0
    let lastTouchY = 0
    let lastPinchDist = 0

    const getTouchDistance = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX
      const dy = t1.clientY - t2.clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX
        lastTouchY = e.touches[0].clientY
      } else if (e.touches.length === 2) {
        lastPinchDist = getTouchDistance(e.touches[0], e.touches[1])
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      
      // Single touch: pan
      if (e.touches.length === 1) {
        const dx = lastTouchX - e.touches[0].clientX
        const dy = lastTouchY - e.touches[0].clientY
        lastTouchX = e.touches[0].clientX
        lastTouchY = e.touches[0].clientY
        setScrollX(sx => Math.max(0, sx + dx))
        setScrollY(sy => {
          const maxSy = Math.max(0, totalHeight - canvas.height / (window.devicePixelRatio || 1))
          return Math.max(0, Math.min(maxSy, sy + dy))
        })
      }
      
      // Two fingers: pinch-to-zoom
      if (e.touches.length === 2) {
        const dist = getTouchDistance(e.touches[0], e.touches[1])
        if (lastPinchDist > 0) {
          const scale = dist / lastPinchDist
          setZoom(z => Math.max(0.3, Math.min(5, z * scale)))
        }
        lastPinchDist = dist
      }
    }

    const onTouchEnd = () => {
      lastPinchDist = 0
    }

    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [totalHeight])

  /* ── drop zone ── */
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragFile(true)
  }
  const onDragLeave = () => setDragFile(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragFile(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  /* ── file picker ── */
  const fileInputRef = useRef<HTMLInputElement>(null)
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg)',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: 'var(--toolbar-bg)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <button onClick={() => fileInputRef.current?.click()}>
          📂 Загрузить MIDI
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mid,.midi"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        <button
          onClick={isPlaying ? stopPlayback : startPlayback}
          disabled={notes.length === 0}
          className={isPlaying ? 'active' : ''}
        >
          {isPlaying ? '⏹ Stop' : '▶️ Play'}
        </button>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        <button onClick={() => setZoom(z => Math.min(5, z * 1.25))}>🔍+</button>
        <button onClick={() => setZoom(z => Math.max(0.3, z * 0.8))}>🔍−</button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>
          {Math.round(zoom * 100)}%
        </span>

        {fileName && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              color: 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 200,
            }}
          >
            🎵 {fileName} • {notes.length} нот • {duration.toFixed(1)}s
          </span>
        )}
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <canvas ref={canvasRef} style={{ display: 'block' }} />

        {/* Loading state */}
        {isAutoLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 20,
              color: 'var(--text-secondary)',
              pointerEvents: 'none',
              background: 'var(--bg)',
            }}
          >
            <div className="spinner" />
            <div className="loading-text" style={{ fontSize: 16, fontWeight: 600 }}>
              Загрузка MIDI...
            </div>
          </div>
        )}

        {/* Error state */}
        {autoLoadError && notes.length === 0 && !isAutoLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              color: 'var(--text-secondary)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 56 }}>😕</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
              Не удалось загрузить MIDI
            </div>
            <div style={{ 
              fontSize: 14, 
              opacity: 0.8, 
              maxWidth: 280,
              lineHeight: 1.4,
              background: 'rgba(233, 69, 96, 0.1)',
              padding: '8px 16px',
              borderRadius: 8,
              color: '#e94560',
            }}>
              {autoLoadError}
            </div>
            <div style={{ fontSize: 14, marginTop: 12, opacity: 0.7 }}>
              Попробуйте загрузить файл вручную 👆
            </div>
          </div>
        )}

        {/* Empty state */}
        {notes.length === 0 && !dragFile && !isAutoLoading && !autoLoadError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 20,
              color: 'var(--text-secondary)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 72, marginBottom: 8 }}>🎹</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
              Piano Roll
            </div>
            <div style={{ fontSize: 15, maxWidth: 260, lineHeight: 1.5 }}>
              Перетащите MIDI файл сюда<br />
              или нажмите кнопку выше
            </div>
            <div style={{ 
              marginTop: 16,
              padding: '12px 20px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 12,
              fontSize: 13,
              opacity: 0.6,
            }}>
              💡 Поддерживаются .mid и .midi файлы
            </div>
          </div>
        )}

        {/* Drag overlay */}
        {dragFile && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 52, 96, 0.8)',
              border: '3px dashed #e94560',
              borderRadius: 12,
              margin: 8,
              fontSize: 20,
              color: '#fff',
              fontWeight: 600,
              zIndex: 10,
            }}
          >
            📥 Отпустите файл для загрузки
          </div>
        )}
      </div>
    </div>
  )
}

/* Utility: rounded rectangle */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  if (w < 2 * r) r = w / 2
  if (h < 2 * r) r = h / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export default PianoRoll

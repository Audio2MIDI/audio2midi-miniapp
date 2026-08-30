import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Midi } from '@tonejs/midi'
import * as Tone from 'tone'
import { fetchLatestMidi } from '../api/midi'
import { ApiError } from '../api/client'
import { trackSuccessfulVisualizerLoad } from '../api/analytics'

/* ── constants ── */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const MIN_PITCH = 21   // A0
const MAX_PITCH = 108  // C8
const PIANO_KEY_WIDTH = 56
const NOTE_HEIGHT_BASE = 14
const PIXELS_PER_SEC_BASE = 120
const ORIENTATION_STORAGE_KEY = 'pianoroll_orientation'

type Orientation = 'horizontal' | 'vertical'

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

function getStoredOrientation(): Orientation {
  try {
    const stored = localStorage.getItem(ORIENTATION_STORAGE_KEY)
    if (stored === 'horizontal' || stored === 'vertical') return stored
  } catch {
    // Storage can be unavailable inside a restricted WebView.
  }
  return 'horizontal'
}

function setStoredOrientation(o: Orientation) {
  try {
    localStorage.setItem(ORIENTATION_STORAGE_KEY, o)
  } catch {
    // Keep the current session working even if orientation cannot be persisted.
  }
}

interface MidiNote {
  pitch: number
  time: number
  duration: number
  velocity: number
  track: number
}

interface PianoRollProps {
  midiParam?: string | null  // MIDI ID to auto-load from backend API
  fileUrl?: string | null    // Direct MIDI URL (e.g. S3) to fetch
  userId?: number | null     // User ID to load latest MIDI
  initData?: string | null   // Telegram initData for auth
}

/* ── component ── */
const PianoRoll: React.FC<PianoRollProps> = ({ midiParam, fileUrl, userId, initData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number>(0)
  const trackedMidiSourcesRef = useRef(new Set<string>())

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
  const [orientation, setOrientation] = useState<Orientation>(getStoredOrientation)
  
  // Auto-load states
  const [isAutoLoading, setIsAutoLoading] = useState(false)
  const [autoLoadError, setAutoLoadError] = useState<string | null>(null)
  const [samplerLoaded, setSamplerLoaded] = useState(false)

  const synthRef = useRef<Tone.Sampler | Tone.PolySynth | null>(null)
  const scheduledRef = useRef<number[]>([])

  const noteHeight = NOTE_HEIGHT_BASE * zoom
  const pixelsPerSec = PIXELS_PER_SEC_BASE * zoom
  const noteHeightRef = useRef(noteHeight)
  const orientationRef = useRef(orientation)
  noteHeightRef.current = noteHeight
  orientationRef.current = orientation

  /* pitch range */
  const pitchRange = MAX_PITCH - MIN_PITCH + 1
  const totalPitchSize = pitchRange * noteHeight

  /* ── toggle orientation ── */
  const toggleOrientation = useCallback(() => {
    setOrientation(prev => {
      const next = prev === 'horizontal' ? 'vertical' : 'horizontal'
      setStoredOrientation(next)
      return next
    })
  }, [])

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
      setScrollY(0)

      // center on the note range
      if (allNotes.length > 0) {
        const minP = allNotes.reduce((m, n) => Math.min(m, n.pitch), 127)
        const maxP = allNotes.reduce((m, n) => Math.max(m, n.pitch), 0)
        const centerPitch = (minP + maxP) / 2
        const canvas = canvasRef.current
        if (canvas) {
          const canvasH = canvas.height / (window.devicePixelRatio || 1)
          const canvasW = canvas.width / (window.devicePixelRatio || 1)
          
          if (orientationRef.current === 'horizontal') {
            const yCenter = (MAX_PITCH - centerPitch) * noteHeightRef.current - canvasH / 2
            setScrollY(Math.max(0, yCenter))
          } else {
            // Vertical mode: center horizontally on pitch range
            const xCenter = (centerPitch - MIN_PITCH) * noteHeightRef.current - (canvasW - PIANO_KEY_WIDTH) / 2
            setScrollX(Math.max(0, xCenter))
          }
        }
      }

      stopPlayback()
      const trackingKey = fileUrl || midiParam || `local:${name}`
      trackSuccessfulVisualizerLoad(trackedMidiSourcesRef.current, trackingKey, fileUrl)
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'audio2midi:visualizer-ready' }, window.location.origin)
      }
    } catch (e) {
      console.error('Failed to parse MIDI:', e)
      alert('Не удалось прочитать MIDI файл')
    }
  }, [fileUrl, midiParam, stopPlayback])

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

  /* ── auto-load MIDI from API or direct URL ── */
  useEffect(() => {
    // Need midiParam, fileUrl, or userId to auto-load
    if (!midiParam && !fileUrl && !userId) return
    const controller = new AbortController()
    
    const loadFromSource = async () => {
      setIsAutoLoading(true)
      setAutoLoadError(null)
      
      try {
        if (fileUrl) {
          // Direct URL mode (S3 link via ?file= param)
          const response = await fetch(fileUrl, { signal: controller.signal })
          if (!response.ok) {
            throw new Error(`Failed to fetch MIDI: HTTP ${response.status}`)
          }
          const buffer = await response.arrayBuffer()
          const urlFilename = fileUrl.split('/').pop()?.split('?')[0] || 'file.mid'
          loadMidi(buffer, decodeURIComponent(urlFilename))
        } else if (midiParam) {
          // Backend API mode (midi_id via ?midi= param)
          const data = await fetchLatestMidi(midiParam)
          
          if (!data.ok || !data.data) {
            throw new Error(data.error || 'No MIDI data received')
          }
          
          // Decode base64 MIDI data
          const binaryString = atob(data.data)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          
          loadMidi(bytes.buffer, data.filename || `${midiParam}.mid`)
        }
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof ApiError && err.status === 404) {
          // No MIDI found — not an error, just show empty state
          console.log('No MIDI found for', midiParam || userId)
          return
        }
        console.error('Auto-load MIDI failed:', err)
        setAutoLoadError(err instanceof Error ? err.message : 'Failed to load MIDI')
      } finally {
        setIsAutoLoading(false)
      }
    }

    void loadFromSource()
    return () => controller.abort()
  }, [midiParam, fileUrl, userId, initData, loadMidi])

  /* ── playback ── */
  const startPlayback = useCallback(async () => {
    if (notes.length === 0) return

    await Tone.start()

    if (!synthRef.current) {
      // Grand Piano using Salamander samples
      const sampler = new Tone.Sampler({
        urls: {
          A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
          A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
          A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
          A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
          A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
          A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
          A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
          A7: 'A7.mp3', C8: 'C8.mp3',
        },
        release: 1,
        baseUrl: 'https://tonejs.github.io/audio/salamander/',
        volume: -6,
        onload: () => setSamplerLoaded(true),
      }).toDestination()
      synthRef.current = sampler
    }

    // Wait for sampler to load if needed
    if (synthRef.current instanceof Tone.Sampler && !samplerLoaded) {
      return // Will retry when samplerLoaded becomes true
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
  }, [notes, playOffset, samplerLoaded])

  /* ── drawing ── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const W = canvas.width / dpr
    const H = canvas.height / dpr

    ctx.clearRect(0, 0, W, H)

    const nh = noteHeight
    const pps = pixelsPerSec
    const sx = scrollX
    const sy = scrollY
    const keyW = PIANO_KEY_WIDTH

    if (orientation === 'horizontal') {
      /* ══════════════════════════════════════════════════════════════════
         HORIZONTAL MODE: time left→right, pitch bottom→top
         ══════════════════════════════════════════════════════════════════ */
      
      /* ── piano keys (left panel) ── */
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

      // vertical grid lines (every beat)
      const bpm = midi?.header?.tempos?.[0]?.bpm || 120
      const beatSec = 60 / bpm
      const barSec = beatSec * (midi?.header?.timeSignatures?.[0]?.timeSignature?.[0] || 4)

      const startSec = sx / pps
      const endSec = (sx + W - keyW) / pps

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

        if (x + w < keyW || x > W || y + nh < 0 || y > H) continue

        const clampX = Math.max(x, keyW)
        const clampW = Math.min(x + w, W) - clampX

        ctx.fillStyle = velocityColor(n.velocity)
        ctx.beginPath()
        const r = Math.min(3, nh / 3)
        roundRect(ctx, clampX, y + 1, clampW, nh - 2, r)
        ctx.fill()

        ctx.strokeStyle = 'rgba(0,0,0,0.3)'
        ctx.lineWidth = 0.5
        ctx.stroke()

        if (clampW > 28 && nh > 10) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)'
          ctx.font = `${Math.min(10, nh - 4)}px monospace`
          ctx.textBaseline = 'middle'
          ctx.fillText(noteName(n.pitch), clampX + 3, y + nh / 2)
        }
      }

      /* ── playhead (vertical line) ── */
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

    } else {
      /* ══════════════════════════════════════════════════════════════════
         VERTICAL MODE: time top→bottom, pitch left→right (Guitar Hero style)
         Piano keys at bottom, notes fall from top
         ══════════════════════════════════════════════════════════════════ */
      
      const keyH = PIANO_KEY_WIDTH  // Height of piano keys bar at bottom
      const gridH = H - keyH        // Grid area height

      /* ── piano keys (bottom panel) ── */
      for (let p = MIN_PITCH; p <= MAX_PITCH; p++) {
        const x = (p - MIN_PITCH) * nh - sx
        if (x + nh < 0 || x > W) continue

        const black = isBlackKey(p)
        ctx.fillStyle = black ? '#1a1a28' : '#2a2a3e'
        ctx.fillRect(x, gridH, nh, keyH)
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.strokeRect(x, gridH, nh, keyH)

        // Label (rotated or simplified)
        if ((p % 12 === 0 || !black) && nh > 12) {
          ctx.fillStyle = black ? '#888' : '#bbb'
          ctx.font = `${Math.max(8, Math.min(10, nh * 0.6))}px monospace`
          ctx.textBaseline = 'top'
          ctx.textAlign = 'center'
          ctx.fillText(noteName(p), x + nh / 2, gridH + 4)
        }
      }
      ctx.textAlign = 'left'

      /* ── grid area ── */
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, W, gridH)
      ctx.clip()

      // vertical lines per pitch
      for (let p = MIN_PITCH; p <= MAX_PITCH; p++) {
        const x = (p - MIN_PITCH) * nh - sx
        if (x + nh < 0 || x > W) continue

        const black = isBlackKey(p)
        ctx.fillStyle = black ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)'
        ctx.fillRect(x, 0, nh, gridH)

        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(x + nh, 0)
        ctx.lineTo(x + nh, gridH)
        ctx.stroke()
      }

      // horizontal grid lines (every beat) - time flows top to bottom
      const bpm = midi?.header?.tempos?.[0]?.bpm || 120
      const beatSec = 60 / bpm
      const barSec = beatSec * (midi?.header?.timeSignatures?.[0]?.timeSignature?.[0] || 4)

      const startSec = sy / pps
      const endSec = (sy + gridH) / pps

      const firstBeat = Math.floor(startSec / beatSec)
      for (let i = firstBeat; i * beatSec <= endSec + beatSec; i++) {
        const t = i * beatSec
        const y = t * pps - sy
        if (y < 0 || y > gridH) continue

        const isBar = Math.abs(t % barSec) < 0.001 || Math.abs((t % barSec) - barSec) < 0.001
        ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'
        ctx.lineWidth = isBar ? 1.5 : 0.5
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()

        if (isBar) {
          const barNum = Math.round(t / barSec) + 1
          ctx.fillStyle = 'rgba(255,255,255,0.35)'
          ctx.font = '11px monospace'
          ctx.textBaseline = 'top'
          ctx.fillText(`${barNum}`, 4, y + 3)
        }
      }

      /* ── notes ── */
      for (const n of notes) {
        const x = (n.pitch - MIN_PITCH) * nh - sx
        const y = n.time * pps - sy
        const h = n.duration * pps

        if (x + nh < 0 || x > W || y + h < 0 || y > gridH) continue

        const clampY = Math.max(y, 0)
        const clampH = Math.min(y + h, gridH) - clampY

        ctx.fillStyle = velocityColor(n.velocity)
        ctx.beginPath()
        const r = Math.min(3, nh / 3)
        roundRect(ctx, x + 1, clampY, nh - 2, clampH, r)
        ctx.fill()

        ctx.strokeStyle = 'rgba(0,0,0,0.3)'
        ctx.lineWidth = 0.5
        ctx.stroke()

        if (clampH > 28 && nh > 10) {
          ctx.save()
          ctx.translate(x + nh / 2, clampY + 14)
          ctx.rotate(-Math.PI / 2)
          ctx.fillStyle = 'rgba(0,0,0,0.6)'
          ctx.font = `${Math.min(10, nh - 4)}px monospace`
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'center'
          ctx.fillText(noteName(n.pitch), 0, 0)
          ctx.restore()
        }
      }

      /* ── playhead (horizontal line moving top→bottom) ── */
      if (isPlaying) {
        const elapsed = Tone.now() - playStartTime
        const py = elapsed * pps - sy
        if (py >= 0 && py <= gridH) {
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(0, py)
          ctx.lineTo(W, py)
          ctx.stroke()

          ctx.fillStyle = '#fff'
          ctx.beginPath()
          ctx.moveTo(0, py - 5)
          ctx.lineTo(0, py + 5)
          ctx.lineTo(8, py)
          ctx.fill()
        }
      }

      ctx.restore()

      // Draw separator line between grid and piano keys
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, gridH)
      ctx.lineTo(W, gridH)
      ctx.stroke()
    }

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(draw)
    }
  }, [notes, midi, scrollX, scrollY, noteHeight, pixelsPerSec, isPlaying, playStartTime, orientation])

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
      const dpr = window.devicePixelRatio || 1
      
      if (e.ctrlKey || e.metaKey) {
        // zoom
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        setZoom(z => Math.max(0.3, Math.min(5, z * delta)))
      } else if (orientation === 'horizontal') {
        // Horizontal mode: deltaX = time scroll, deltaY = pitch scroll
        setScrollX(sx => Math.max(0, sx + e.deltaX + (e.shiftKey ? e.deltaY : 0)))
        setScrollY(sy => {
          const maxSy = Math.max(0, totalPitchSize - canvas.height / dpr)
          return Math.max(0, Math.min(maxSy, sy + (e.shiftKey ? 0 : e.deltaY)))
        })
      } else {
        // Vertical mode: deltaY = time scroll (top→bottom), deltaX = pitch scroll
        setScrollY(sy => Math.max(0, sy + e.deltaY + (e.shiftKey ? e.deltaX : 0)))
        setScrollX(sx => {
          const maxSx = Math.max(0, totalPitchSize - canvas.width / dpr)
          return Math.max(0, Math.min(maxSx, sx + (e.shiftKey ? 0 : e.deltaX)))
        })
      }
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [totalPitchSize, orientation])

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
      const dpr = window.devicePixelRatio || 1
      
      // Single touch: pan
      if (e.touches.length === 1) {
        const dx = lastTouchX - e.touches[0].clientX
        const dy = lastTouchY - e.touches[0].clientY
        lastTouchX = e.touches[0].clientX
        lastTouchY = e.touches[0].clientY
        
        if (orientation === 'horizontal') {
          // Horizontal: dx = time, dy = pitch
          setScrollX(sx => Math.max(0, sx + dx))
          setScrollY(sy => {
            const maxSy = Math.max(0, totalPitchSize - canvas.height / dpr)
            return Math.max(0, Math.min(maxSy, sy + dy))
          })
        } else {
          // Vertical: dy = time, dx = pitch
          setScrollY(sy => Math.max(0, sy + dy))
          setScrollX(sx => {
            const maxSx = Math.max(0, totalPitchSize - canvas.width / dpr)
            return Math.max(0, Math.min(maxSx, sx + dx))
          })
        }
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
  }, [totalPitchSize, orientation])

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

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        {/* Orientation toggle button */}
        <button
          onClick={toggleOrientation}
          title={orientation === 'horizontal' ? 'Вертикальный режим (Guitar Hero)' : 'Горизонтальный режим'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {orientation === 'horizontal' ? '↕️' : '↔️'}
          <span style={{ fontSize: 11 }}>
            {orientation === 'horizontal' ? 'Верт.' : 'Гориз.'}
          </span>
        </button>

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

import { useRef, useState, useCallback, useEffect } from 'react'
import { api } from '../api/client'
import { usePlayerStore } from '../stores/playerStore'
import { getStemColor } from '../lib/constants'

export type StemState = {
  name: string
  volume: number
  muted: boolean
  soloed: boolean
  peaks: number[]
  duration: number
  ready: boolean
  color: string
}

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

function effectiveStemGain(st: StemState, anySoloed: boolean): number {
  if (anySoloed) return st.soloed ? st.volume : 0
  return st.muted ? 0 : st.volume
}

export function useCustomAudioPlayer(songId: string, stemNames: string[]) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const stemGainNodesRef = useRef<Map<string, GainNode>>(new Map())
  const eqFiltersRef = useRef<BiquadFilterNode[]>([])
  const sourceNodesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map())
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map())

  // Timing: songPosition = audioContext.currentTime - startTimeRef.current
  // startTimeRef is set to (audioContext.currentTime - offset) on each play call.
  const startTimeRef = useRef<number>(0)
  // pauseTimeRef: song position (seconds) at last pause/seek — the offset for the next play.
  const pauseTimeRef = useRef<number>(0)
  const isPlayingRef = useRef<boolean>(false)
  const durationRef = useRef<number>(0)

  const [stemStates, setStemStates] = useState<Map<string, StemState>>(new Map())
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [masterVolume, setMasterVolumeState] = useState(1)

  const setIsPlayingStore = usePlayerStore(s => s.setIsPlaying)
  const setCurrentTimeStore = usePlayerStore(s => s.setCurrentTime)
  const setDurationStore = usePlayerStore(s => s.setDuration)

  const animationRef = useRef<number>(0)

  // Keep durationRef in sync so updateTime never closes over a stale value.
  useEffect(() => { durationRef.current = duration }, [duration])

  const stopAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = 0
    }
  }, [])

  // rAF loop — reads refs only, no stale state.
  const updateTime = useCallback(() => {
    if (!isPlayingRef.current || !audioContextRef.current) return

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current
    const dur = durationRef.current
    const newTime = dur > 0 ? Math.min(elapsed, dur) : Math.max(0, elapsed)

    setCurrentTime(newTime)
    setCurrentTimeStore(newTime)

    if (dur > 0 && elapsed >= dur) {
      // Natural end of song
      isPlayingRef.current = false
      pauseTimeRef.current = 0
      setIsPlaying(false)
      setIsPlayingStore(false)
      return
    }

    animationRef.current = requestAnimationFrame(updateTime)
  }, [setCurrentTimeStore, setIsPlayingStore])

  // ── Load stems on song change ──────────────────────────────────────────────
  useEffect(() => {
    if (!songId || stemNames.length === 0) return

    setIsReady(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    pauseTimeRef.current = 0
    isPlayingRef.current = false
    bufferCacheRef.current.clear()

    const audioContext = new AudioContext()
    audioContextRef.current = audioContext

    // Master gain → destination
    const masterGain = audioContext.createGain()
    masterGain.connect(audioContext.destination)
    masterGainRef.current = masterGain

    // EQ filter chain → masterGain
    const filters = EQ_FREQUENCIES.map((freq, idx) => {
      const filter = audioContext.createBiquadFilter()
      filter.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking'
      filter.frequency.value = freq
      filter.Q.value = 1.4
      filter.gain.value = 0
      return filter
    })
    eqFiltersRef.current = filters
    for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1])
    filters[filters.length - 1].connect(masterGain)

    // Per-stem gain nodes → EQ chain
    stemGainNodesRef.current.clear()
    stemNames.forEach(name => {
      const gainNode = audioContext.createGain()
      gainNode.gain.value = 1
      gainNode.connect(filters[0])
      stemGainNodesRef.current.set(name, gainNode)
    })

    setStemStates(new Map(stemNames.map(name => [name, {
      name, volume: 1, muted: false, soloed: false, peaks: [], duration: 0, ready: false,
      color: getStemColor(name),
    }])))

    const waveformReady = new Set<string>()
    const audioReady = new Set<string>()

    function checkReady() {
      if (waveformReady.size === stemNames.length && audioReady.size === stemNames.length) {
        setIsReady(true)
      }
    }

    stemNames.forEach(async (name) => {
      // Waveform (visual peaks)
      try {
        const waveformData = await api.getWaveform(songId, name)
        if (waveformData) {
          setStemStates(prev => {
            const next = new Map(prev)
            const s = next.get(name)
            if (s) next.set(name, { ...s, peaks: waveformData.peaks, duration: waveformData.duration })
            return next
          })
        }
      } catch {}
      waveformReady.add(name)
      checkReady()

      // Audio buffer (decode once, cache for the lifetime of this song)
      try {
        const response = await fetch(api.stemUrl(songId, name))
        const arrayBuffer = await response.arrayBuffer()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        bufferCacheRef.current.set(name, audioBuffer)

        setStemStates(prev => {
          const next = new Map(prev)
          const s = next.get(name)
          if (s) next.set(name, { ...s, ready: true, duration: audioBuffer.duration })
          return next
        })

        if (name === stemNames[0]) {
          setDuration(audioBuffer.duration)
          setDurationStore(audioBuffer.duration)
        }
      } catch (e) {
        console.error(`Failed to load stem ${name}:`, e)
      }
      audioReady.add(name)
      checkReady()
    })

    return () => {
      stopAnimation()
      sourceNodesRef.current.forEach(node => { try { node.stop() } catch {} })
      sourceNodesRef.current.clear()
      stemGainNodesRef.current.forEach(node => { try { node.disconnect() } catch {} })
      stemGainNodesRef.current.clear()
      bufferCacheRef.current.clear()
      audioContext.close().catch(() => {})
      audioContextRef.current = null
      masterGainRef.current = null
      isPlayingRef.current = false
    }
  }, [songId, stemNames.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback controls ──────────────────────────────────────────────────────

  const play = useCallback(async () => {
    const audioContext = audioContextRef.current
    if (!audioContext || !isReady) return

    // Browser autoplay policy: AudioContext starts suspended until a user gesture.
    if (audioContext.state === 'suspended') {
      try { await audioContext.resume() } catch {}
    }

    // Tear down any currently running sources (handles seek-while-playing).
    sourceNodesRef.current.forEach(node => { try { node.stop() } catch {} })
    sourceNodesRef.current.clear()
    stopAnimation()

    const offset = pauseTimeRef.current
    // Anchor: song position 0 corresponds to this audioContext time.
    startTimeRef.current = audioContext.currentTime - offset

    stemNames.forEach(name => {
      const buffer = bufferCacheRef.current.get(name)
      if (!buffer) return

      const source = audioContext.createBufferSource()
      source.buffer = buffer
      const gainNode = stemGainNodesRef.current.get(name)
      source.connect(gainNode ?? eqFiltersRef.current[0])
      source.start(0, offset)
      sourceNodesRef.current.set(name, source)

      // Natural end: detect via the first stem's onended.
      // We check elapsed time to distinguish natural end from an explicit stop() call.
      if (name === stemNames[0]) {
        source.onended = () => {
          if (!isPlayingRef.current) return
          const ac = audioContextRef.current
          const elapsed = ac ? ac.currentTime - startTimeRef.current : buffer.duration
          if (elapsed >= buffer.duration - 0.3) {
            isPlayingRef.current = false
            pauseTimeRef.current = 0
            setIsPlaying(false)
            setIsPlayingStore(false)
            stopAnimation()
          }
        }
      }
    })

    isPlayingRef.current = true
    setIsPlaying(true)
    setIsPlayingStore(true)
    animationRef.current = requestAnimationFrame(updateTime)
  }, [isReady, stemNames, updateTime, setIsPlayingStore, stopAnimation])

  const pause = useCallback(() => {
    const audioContext = audioContextRef.current
    if (!audioContext) return

    // Capture current position before stopping sources.
    pauseTimeRef.current = audioContext.currentTime - startTimeRef.current

    isPlayingRef.current = false
    setIsPlaying(false)
    setIsPlayingStore(false)
    stopAnimation()

    sourceNodesRef.current.forEach(node => { try { node.stop() } catch {} })
    sourceNodesRef.current.clear()
  }, [setIsPlayingStore, stopAnimation])

  const togglePlay = useCallback(async () => {
    if (isPlayingRef.current) pause()
    else await play()
  }, [play, pause])

  const seek = useCallback((time: number) => {
    const clampedTime = Math.max(0, Math.min(durationRef.current || Infinity, time))
    const wasPlaying = isPlayingRef.current

    // Stop current sources without updating pauseTimeRef yet.
    if (wasPlaying) {
      isPlayingRef.current = false
      sourceNodesRef.current.forEach(node => { try { node.stop() } catch {} })
      sourceNodesRef.current.clear()
      stopAnimation()
    }

    pauseTimeRef.current = clampedTime
    setCurrentTime(clampedTime)
    setCurrentTimeStore(clampedTime)

    if (wasPlaying) play()
  }, [play, setCurrentTimeStore, stopAnimation])

  const setMasterVolume = useCallback((vol: number) => {
    setMasterVolumeState(vol)
    if (masterGainRef.current) masterGainRef.current.gain.value = vol
  }, [])

  const setVolume = useCallback((name: string, volume: number) => {
    setStemStates(prev => {
      const next = new Map(prev)
      const s = next.get(name)
      if (!s) return prev
      const updated = { ...s, volume }
      next.set(name, updated)
      const anySoloed = [...next.values()].some(st => st.soloed)
      const gainNode = stemGainNodesRef.current.get(name)
      if (gainNode) gainNode.gain.value = effectiveStemGain(updated, anySoloed)
      return next
    })
  }, [])

  const toggleMute = useCallback((name: string) => {
    setStemStates(prev => {
      const next = new Map(prev)
      const s = next.get(name)
      if (!s) return prev
      const updated = { ...s, muted: !s.muted }
      next.set(name, updated)
      const anySoloed = [...next.values()].some(st => st.soloed)
      const gainNode = stemGainNodesRef.current.get(name)
      if (gainNode) gainNode.gain.value = effectiveStemGain(updated, anySoloed)
      return next
    })
  }, [])

  const toggleSolo = useCallback((name: string) => {
    setStemStates(prev => {
      const next = new Map(prev)
      const s = next.get(name)
      if (!s) return prev
      const newSoloed = !s.soloed
      if (newSoloed) {
        next.forEach((st, stemName) => next.set(stemName, { ...st, soloed: stemName === name }))
      } else {
        next.set(name, { ...s, soloed: false })
      }
      const anySoloed = [...next.values()].some(st => st.soloed)
      next.forEach((st, stemName) => {
        const gainNode = stemGainNodesRef.current.get(stemName)
        if (gainNode) gainNode.gain.value = effectiveStemGain(st, anySoloed)
      })
      return next
    })
  }, [])

  const setEq = useCallback((gains: number[]) => {
    eqFiltersRef.current.forEach((filter, idx) => {
      if (gains[idx] !== undefined) filter.gain.value = gains[idx]
    })
  }, [])

  return {
    stemStates, isReady, isPlaying, currentTime, duration, masterVolume,
    play, pause, togglePlay, seek,
    setMasterVolume, setVolume, setEq, toggleMute, toggleSolo,
  }
}

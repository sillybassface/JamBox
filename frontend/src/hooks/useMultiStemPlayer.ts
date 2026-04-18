import { useEffect, useRef, useState, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'
// Import internal WebAudioPlayer to share one AudioContext across all stems.
// WaveSurfer ignores options.audioContext — the only way to share a context is
// to construct WebAudioPlayer ourselves and pass it via options.media.
import WebAudioPlayer from 'wavesurfer.js/dist/webaudio.js'
import { api, WaveformData } from '../api/client'
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

function effectiveVolume(st: StemState, anySoloed: boolean, masterVol: number): number {
  if (anySoloed) return st.soloed ? st.volume * masterVol : 0
  return st.muted ? 0 : st.volume * masterVol
}

export function useMultiStemPlayer(songId: string, stemNames: string[]) {
  const instancesRef = useRef<Map<string, WaveSurfer>>(new Map())
  const stemStatesRef = useRef<Map<string, StemState>>(new Map())
  const currentTimeRef = useRef(0)
  const [stemStates, setStemStates] = useState<Map<string, StemState>>(new Map())
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [masterVolume, setMasterVolumeState] = useState(1)
  const masterVolumeRef = useRef(1)
  const masterRef = useRef<WaveSurfer | null>(null)
  // Two separate readiness sets: waveform rendered vs audio buffer decoded.
  // When peaks+duration are pre-provided, WaveSurfer fires 'ready' before the
  // WebAudioPlayer finishes decoding the audio — so we track both independently.
  const waveformReadyRef = useRef<Set<string>>(new Set())
  const audioReadyRef = useRef<Set<string>>(new Set())
  const pendingPlayRef = useRef(false)
  const allReadyFiredRef = useRef(false)
  // One shared AudioContext for all stems — resumed during user gesture so that
  // the deferred pending-play (which fires outside a gesture) also works.
  const audioContextRef = useRef<AudioContext | null>(null)
  const eqFiltersRef = useRef<BiquadFilterNode[]>([])

  const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

  const setIsPlayingStore = usePlayerStore(s => s.setIsPlaying)
  const setCurrentTimeStore = usePlayerStore(s => s.setCurrentTime)
  const setDurationStore = usePlayerStore(s => s.setDuration)

  useEffect(() => { stemStatesRef.current = stemStates }, [stemStates])

  useEffect(() => {
    if (!songId || stemNames.length === 0) return

    setIsReady(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)

    const audioContext = new AudioContext()
    audioContextRef.current = audioContext

    const filters = EQ_FREQUENCIES.map((freq, idx) => {
      const filter = audioContext.createBiquadFilter()
      filter.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking'
      filter.frequency.value = freq
      filter.Q.value = 1.4
      filter.gain.value = 0
      return filter
    })
    eqFiltersRef.current = filters

    setStemStates(new Map(stemNames.map(name => [name, {
      name,
      volume: 1,
      muted: false,
      soloed: false,
      peaks: [],
      duration: 0,
      ready: false,
      color: getStemColor(name),
    }])))

    // Called whenever either waveform-ready or audio-ready set changes.
    // Triggers setIsReady + pending play once BOTH sets are full.
    function checkAllReady() {
      if (allReadyFiredRef.current) return
      if (
        waveformReadyRef.current.size === stemNames.length &&
        audioReadyRef.current.size === stemNames.length
      ) {
        allReadyFiredRef.current = true
        setTimeout(() => {
          setIsReady(true)
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false
            setTimeout(async () => {
              if (audioContext.state === 'suspended') {
                try { await audioContext.resume() } catch {}
              }
              for (const ws of instancesRef.current.values()) {
                try {
                  const result = ws.play()
                  if (result && typeof result.then === 'function') await result
                } catch (e) {
                  console.warn('Play failed:', e)
                }
              }
              setIsPlaying(true)
              setIsPlayingStore(true)
            }, 0)
          }
        }, 100)
      }
    }

    stemNames.forEach(async (name, idx) => {
      let waveformData: WaveformData | null = null
      try {
        waveformData = await api.getWaveform(songId, name)
      } catch {}

      if (waveformData) {
        setStemStates(prev => {
          const next = new Map(prev)
          const s = next.get(name)
          if (s) next.set(name, { ...s, peaks: waveformData.peaks, duration: waveformData.duration })
          return next
        })
      }

      const containerId = `ws-${songId}-${name}`
      let container = document.getElementById(containerId)
      if (!container) {
        container = document.createElement('div')
        container.id = containerId
        container.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;'
        document.body.appendChild(container)
      }

      // Create WebAudioPlayer with the shared AudioContext.
      const player = new WebAudioPlayer(audioContext)
      
      // Try to inject EQ filters into the audio chain
      // The WebAudioPlayer doesn't expose its source, but we can try to intercept
      player.addEventListener('canplay', () => {
        audioReadyRef.current.add(name)
        checkAllReady()
      }, { once: true })

      const ws = WaveSurfer.create({
        container,
        media: player as unknown as HTMLMediaElement,
        waveColor: getStemColor(name),
        progressColor: getStemColor(name) + '80',
        height: 1,
        barWidth: 2,
        interact: false,
        peaks: waveformData ? [waveformData.peaks as unknown as Float32Array] : undefined,
        duration: waveformData?.duration,
        url: api.stemUrl(songId, name),
      })

      instancesRef.current.set(name, ws)

      ws.on('ready', () => {
        waveformReadyRef.current.add(name)
        if (idx === 0) {
          const dur = ws.getDuration()
          setDuration(dur)
          setDurationStore(dur)
          masterRef.current = ws
        }
        setStemStates(prev => {
          const next = new Map(prev)
          const s = next.get(name)
          if (s) next.set(name, { ...s, ready: true, duration: ws.getDuration() })
          return next
        })
        checkAllReady()
      })

      ws.on('audioprocess', (t) => {
        if (idx === 0) {
          currentTimeRef.current = t
          setCurrentTime(t)
          setCurrentTimeStore(t)
        }
      })

      ws.on('finish', () => {
        if (idx === 0) {
          setIsPlaying(false)
          setIsPlayingStore(false)
        }
      })

      ws.on('error', (err: unknown) => {
        console.error(`WaveSurfer error for stem ${name}:`, err)
      })
    })

    return () => {
      instancesRef.current.forEach(ws => { try { ws.pause(); ws.destroy() } catch {} })
      instancesRef.current.clear()
      waveformReadyRef.current.clear()
      audioReadyRef.current.clear()
      allReadyFiredRef.current = false
      pendingPlayRef.current = false
      stemNames.forEach(name => {
        document.getElementById(`ws-${songId}-${name}`)?.remove()
      })
      masterRef.current = null
      audioContext.close().catch(() => {})
      audioContextRef.current = null
      setIsReady(false)
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
    }
  }, [songId, stemNames.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const play = useCallback(async () => {
    // Resume the shared AudioContext during the user gesture so that the
    // deferred pending-play (which fires outside a gesture) also works.
    const ac = audioContextRef.current
    if (ac && ac.state === 'suspended') {
      try { await ac.resume() } catch {}
    }

    if (!isReady) {
      pendingPlayRef.current = true
      setIsPlaying(true)
      return
    }

    for (const ws of instancesRef.current.values()) {
      try {
        const result = ws.play()
        if (result && typeof result.then === 'function') await result
      } catch (e) {
        console.warn('Play failed:', e)
      }
    }

    setIsPlaying(true)
    setIsPlayingStore(true)
  }, [isReady, setIsPlayingStore])

  const pause = useCallback(() => {
    pendingPlayRef.current = false
    instancesRef.current.forEach(ws => { try { ws.pause() } catch {} })
    setIsPlaying(false)
    setIsPlayingStore(false)
  }, [setIsPlayingStore])

  const togglePlay = useCallback(async () => {
    if (isPlaying) pause()
    else await play()
  }, [isPlaying, play, pause])

  const seek = useCallback((time: number) => {
    const dur = masterRef.current?.getDuration() ?? duration
    if (dur <= 0) return
    const progress = Math.max(0, Math.min(1, time / dur))
    instancesRef.current.forEach(ws => { try { ws.seekTo(progress) } catch {} })
    currentTimeRef.current = time
    setCurrentTime(time)
    setCurrentTimeStore(time)
  }, [duration, setCurrentTimeStore])

  const seekRelative = useCallback((delta: number) => {
    seek(currentTimeRef.current + delta)
  }, [seek])

  const setMasterVolume = useCallback((vol: number) => {
    masterVolumeRef.current = vol
    setMasterVolumeState(vol)
    const states = stemStatesRef.current
    const anySoloed = [...states.values()].some(s => s.soloed)
    states.forEach((st, name) => {
      const ws = instancesRef.current.get(name)
      if (!ws) return
      try { ws.setVolume(effectiveVolume(st, anySoloed, vol)) } catch {}
    })
  }, [])

  const setVolume = useCallback((name: string, volume: number) => {
    setStemStates(prev => {
      const next = new Map(prev)
      const s = next.get(name)
      if (!s) return prev
      next.set(name, { ...s, volume })
      const ws = instancesRef.current.get(name)
      if (ws) {
        const anySoloed = [...next.values()].some(st => st.soloed)
        try { ws.setVolume(effectiveVolume(next.get(name)!, anySoloed, masterVolumeRef.current)) } catch {}
      }
      return next
    })
  }, [])

  const setEq = useCallback((gains: number[]) => {
    const filters = eqFiltersRef.current
    if (!filters.length) return
    
    gains.forEach((gain, idx) => {
      if (filters[idx]) {
        filters[idx].gain.value = gain
      }
    })
  }, [])

  const toggleMute = useCallback((name: string) => {
    setStemStates(prev => {
      const next = new Map(prev)
      const s = next.get(name)
      if (!s) return prev
      next.set(name, { ...s, muted: !s.muted })
      const anySoloed = [...next.values()].some(st => st.soloed)
      const ws = instancesRef.current.get(name)
      if (ws) {
        try { ws.setVolume(effectiveVolume(next.get(name)!, anySoloed, masterVolumeRef.current)) } catch {}
      }
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
        next.forEach((st, stemName) => {
          next.set(stemName, { ...st, soloed: stemName === name })
        })
      } else {
        next.set(name, { ...s, soloed: false })
      }
      const anySoloed = [...next.values()].some(st => st.soloed)
      next.forEach((st, stemName) => {
        const ws = instancesRef.current.get(stemName)
        if (!ws) return
        try { ws.setVolume(effectiveVolume(st, anySoloed, masterVolumeRef.current)) } catch {}
      })
      return next
    })
  }, [])

  return {
    stemStates,
    isReady,
    isPlaying,
    currentTime,
    duration,
    masterVolume,
    play,
    pause,
    togglePlay,
    seek,
    seekRelative,
    setMasterVolume,
    setVolume,
    setEq,
    toggleMute,
    toggleSolo,
  }
}

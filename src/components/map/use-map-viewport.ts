/**
 * Viewport controller for the SVG map.
 *
 * The viewBox height is locked to the container's aspect ratio, which makes the
 * client-pixel <-> user-unit mapping exactly linear — that is what lets pan,
 * cursor-anchored zoom and the coordinate readout all agree with each other.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MAP_VIEWBOX } from '@/lib/geo'
import { clamp, type Bbox, type Point } from '@/components/map/map-geometry'

const MAX_ZOOM = 16
const CENTRE: Point = { x: MAP_VIEWBOX.width / 2, y: MAP_VIEWBOX.height / 2 }

export interface ViewState {
  cx: number
  cy: number
  viewW: number
}

export interface MapViewport {
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Container size in CSS pixels. */
  size: { w: number; h: number }
  view: ViewState
  /** Visible region in SVG user units. */
  rect: Bbox
  viewBox: string
  /** SVG user units per CSS pixel — multiply to keep strokes screen-constant. */
  px: number
  /** 1 = whole region visible. */
  zoom: number
  maxZoom: number
  ready: boolean
  setView: (updater: (v: ViewState) => ViewState) => void
  zoomBy: (factor: number, clientX?: number, clientY?: number) => void
  panByPixels: (dxPx: number, dyPx: number) => void
  fitBbox: (b: Bbox, padPct?: number) => void
  reset: () => void
  clientToUser: (clientX: number, clientY: number) => Point
}

export function useMapViewport(): MapViewport {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setViewRaw] = useState<ViewState>({
    cx: CENTRE.x,
    cy: CENTRE.y,
    viewW: MAP_VIEWBOX.width,
  })
  const fittedRef = useRef(false)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize((prev) => {
        const w = Math.max(1, Math.round(r.width))
        const h = Math.max(1, Math.round(r.height))
        return prev.w === w && prev.h === h ? prev : { w, h }
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const aspect = size.w > 0 && size.h > 0 ? size.h / size.w : MAP_VIEWBOX.height / MAP_VIEWBOX.width

  /** viewW at which the entire region is visible, with a little breathing room. */
  const fitW = useMemo(
    () => Math.max(MAP_VIEWBOX.width, MAP_VIEWBOX.height / aspect) * 1.05,
    [aspect],
  )

  const clampView = useCallback(
    (v: ViewState): ViewState => {
      const viewW = clamp(v.viewW, fitW / MAX_ZOOM, fitW)
      const viewH = viewW * aspect
      const W = MAP_VIEWBOX.width
      const H = MAP_VIEWBOX.height
      return {
        viewW,
        cx: clamp(v.cx, Math.min(W / 2, viewW / 2), Math.max(W / 2, W - viewW / 2)),
        cy: clamp(v.cy, Math.min(H / 2, viewH / 2), Math.max(H / 2, H - viewH / 2)),
      }
    },
    [aspect, fitW],
  )

  // Fit once the container has been measured; re-clamp on later resizes.
  useEffect(() => {
    if (size.w === 0) return
    if (!fittedRef.current) {
      fittedRef.current = true
      setViewRaw({ cx: CENTRE.x, cy: CENTRE.y, viewW: fitW })
      return
    }
    setViewRaw((v) => clampView(v))
  }, [size.w, size.h, fitW, clampView])

  const setView = useCallback(
    (updater: (v: ViewState) => ViewState) => setViewRaw((v) => clampView(updater(v))),
    [clampView],
  )

  const viewH = view.viewW * aspect
  const rect: Bbox = {
    x: view.cx - view.viewW / 2,
    y: view.cy - viewH / 2,
    w: view.viewW,
    h: viewH,
  }
  const viewBox = `${rect.x.toFixed(2)} ${rect.y.toFixed(2)} ${rect.w.toFixed(2)} ${rect.h.toFixed(2)}`
  const px = size.w > 0 ? view.viewW / size.w : 1
  const zoom = fitW / view.viewW

  const clientToUser = useCallback(
    (clientX: number, clientY: number): Point => {
      const el = containerRef.current
      if (!el) return { x: 0, y: 0 }
      const r = el.getBoundingClientRect()
      const scale = r.width > 0 ? view.viewW / r.width : 1
      return {
        x: view.cx - view.viewW / 2 + (clientX - r.left) * scale,
        y: view.cy - (view.viewW * aspect) / 2 + (clientY - r.top) * scale,
      }
    },
    [aspect, view.cx, view.cy, view.viewW],
  )

  const zoomBy = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const el = containerRef.current
      setViewRaw((v) => {
        const nextW = clamp(v.viewW / factor, fitW / MAX_ZOOM, fitW)
        if (!el || clientX === undefined || clientY === undefined) {
          return clampView({ ...v, viewW: nextW })
        }
        const r = el.getBoundingClientRect()
        if (r.width === 0) return clampView({ ...v, viewW: nextW })
        const scale = v.viewW / r.width
        // Anchor point under the cursor, in user units.
        const ax = v.cx - v.viewW / 2 + (clientX - r.left) * scale
        const ay = v.cy - (v.viewW * aspect) / 2 + (clientY - r.top) * scale
        const k = nextW / v.viewW
        return clampView({ cx: ax + (v.cx - ax) * k, cy: ay + (v.cy - ay) * k, viewW: nextW })
      })
    },
    [aspect, clampView, fitW],
  )

  const panByPixels = useCallback(
    (dxPx: number, dyPx: number) => {
      setView((v) => {
        const el = containerRef.current
        const scale = el && el.clientWidth > 0 ? v.viewW / el.clientWidth : 1
        return { ...v, cx: v.cx - dxPx * scale, cy: v.cy - dyPx * scale }
      })
    },
    [setView],
  )

  const fitBbox = useCallback(
    (b: Bbox, padPct = 0.22) => {
      const pad = 1 + padPct
      const needW = Math.max(b.w * pad, (b.h * pad) / aspect, 30)
      setView(() => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, viewW: needW }))
    },
    [aspect, setView],
  )

  const reset = useCallback(() => {
    setViewRaw({ cx: CENTRE.x, cy: CENTRE.y, viewW: fitW })
  }, [fitW])

  return {
    containerRef,
    size,
    view,
    rect,
    viewBox,
    px,
    zoom,
    maxZoom: MAX_ZOOM,
    ready: size.w > 0,
    setView,
    zoomBy,
    panByPixels,
    fitBbox,
    reset,
    clientToUser,
  }
}

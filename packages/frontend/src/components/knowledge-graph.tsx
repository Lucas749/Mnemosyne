'use client'

import { useRef, useEffect } from 'react'

const domainColors = ['#b45309', '#d97706', '#c2410c', '#92400e', '#a16207', '#78350f']

function seededRand(n: number) {
  const x = Math.sin(n * 127.1 + 3.14) * 43758.5453
  return x - Math.floor(x)
}

interface KnowledgeGraphProps {
  width?: number
  height?: number
  mini?: boolean
  fullscreen?: boolean
}

export function KnowledgeGraphCanvas({ mini = false, fullscreen = false }: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const nc = mini ? 18 : fullscreen ? 80 : 48

    const nodes = Array.from({ length: nc }, (_, i) => {
      const isAgent = seededRand(i * 11) > 0.82
      return {
        x: W * (0.08 + seededRand(i * 3) * 0.84),
        y: H * (0.08 + seededRand(i * 3 + 1) * 0.84),
        r: isAgent ? (mini ? 5 : 8) : (mini ? 2 + seededRand(i * 3 + 2) * 3 : 4 + seededRand(i * 3 + 2) * 8),
        vx: (seededRand(i * 7) - 0.5) * 0.12,
        vy: (seededRand(i * 7 + 1) - 0.5) * 0.12,
        color: domainColors[Math.floor(seededRand(i * 5) * domainColors.length)],
        cluster: Math.floor(seededRand(i * 5) * 5),
        isAgent,
      }
    })

    const thresh = mini ? 100 : fullscreen ? 180 : 140
    let frame: number

    const draw = () => {
      ctx.clearRect(0, 0, W, H)

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < thresh && nodes[i].cluster === nodes[j].cluster) {
            const alpha = (1 - d / thresh) * 0.25
            ctx.strokeStyle = `rgba(180,83,9,${alpha})`
            ctx.lineWidth = mini ? 0.5 : 0.8
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      nodes.forEach(n => {
        if (n.isAgent) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
          ctx.strokeStyle = n.color + 'cc'
          ctx.lineWidth = mini ? 1.5 : 2.5
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r * 0.45, 0, Math.PI * 2)
          ctx.fillStyle = n.color + '55'
          ctx.fill()
        } else {
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.2)
          g.addColorStop(0, n.color + '40')
          g.addColorStop(1, 'transparent')
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r * 2.2, 0, Math.PI * 2)
          ctx.fillStyle = g
          ctx.fill()
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
          ctx.fillStyle = n.color + 'cc'
          ctx.fill()
        }
      })

      nodes.forEach(n => {
        n.x += n.vx
        n.y += n.vy
        if (n.x < n.r * 2 || n.x > W - n.r * 2) n.vx *= -1
        if (n.y < n.r * 2 || n.y > H - n.r * 2) n.vy *= -1
      })

      frame = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(frame)
  }, [mini, fullscreen])

  return (
    <canvas
      ref={canvasRef}
      width={fullscreen ? 1400 : mini ? 300 : 800}
      height={fullscreen ? 900 : mini ? 200 : 320}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}

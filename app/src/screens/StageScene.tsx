// Уютная сцена-театр за игровым UI: софит на шнуре слегка покачивается,
// из него льётся тёплый конус света, в котором плавают пылинки. Рисуется
// абсолютно позади контента (.stage-scene, z-index 0).
export function StageScene() {
  const motes = [
    { x: 150, y: 300, r: 2.2, d: '0s' },
    { x: 196, y: 360, r: 1.6, d: '1.2s' },
    { x: 232, y: 300, r: 2.6, d: '2.4s' },
    { x: 176, y: 420, r: 1.8, d: '3.1s' },
    { x: 214, y: 250, r: 1.4, d: '4.3s' },
    { x: 158, y: 380, r: 2.0, d: '5.2s' },
    { x: 244, y: 410, r: 1.7, d: '6.0s' },
    { x: 190, y: 470, r: 2.3, d: '6.8s' },
  ]
  return (
    <svg className="stage-scene" viewBox="0 0 400 800" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs>
        <linearGradient id="sc-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4cf" stopOpacity="0.55" />
          <stop offset="0.7" stopColor="#fff4cf" stopOpacity="0.1" />
          <stop offset="1" stopColor="#fff4cf" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sc-curtain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e7c98f" />
          <stop offset="1" stopColor="#e7c98f" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sc-floor" cx="0.5" cy="1" r="0.8">
          <stop offset="0" stopColor="#f8d77e" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f8d77e" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* soft theatre curtains framing the top corners */}
      <path d="M0 0 H120 Q70 70 80 150 Q40 90 0 110 Z" fill="url(#sc-curtain)" opacity="0.5" />
      <path d="M400 0 H280 Q330 70 320 150 Q360 90 400 110 Z" fill="url(#sc-curtain)" opacity="0.5" />

      {/* hanging spotlight on a cord, gently swaying */}
      <g className="sc-lamp">
        <line x1="200" y1="0" x2="200" y2="40" stroke="rgba(122,79,42,.22)" strokeWidth="3" />
        <rect x="186" y="38" width="28" height="14" rx="5" fill="#caa86e" />
        <ellipse cx="200" cy="54" rx="20" ry="7" fill="#fff3cd" />
        {/* warm light cone */}
        <path className="sc-cone" d="M200 54 L92 470 Q200 520 308 470 Z" fill="url(#sc-cone)" />
      </g>

      {/* drifting dust motes in the beam */}
      <g className="sc-motes">
        {motes.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r={m.r} fill="#fff6da" style={{ ['--md' as string]: m.d }} />
        ))}
      </g>

      {/* warm footlight pooling at the bottom of the stage */}
      <rect x="0" y="640" width="400" height="160" fill="url(#sc-floor)" />
    </svg>
  )
}

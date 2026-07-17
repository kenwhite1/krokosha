// Знак «Крокоши»: добродушный зелёный крокодил с облачком-подсказкой.
import { t } from '../i18n'

export function Logo({ size = 132, className = 'brand-logo' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" className={className} aria-label={t('Крокоша')}>
      <defs>
        <linearGradient id="croc-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8ed897" />
          <stop offset="1" stopColor="#3f9a4f" />
        </linearGradient>
        <linearGradient id="croc-snout" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#73c97f" />
          <stop offset="1" stopColor="#4ca85b" />
        </linearGradient>
        <radialGradient id="croc-gloss" cx="0.5" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* soft contact shadow on the ground */}
      <ellipse cx="78" cy="132" rx="52" ry="9" fill="rgba(63,120,60,.18)" />

      {/* speech bubble (associations) */}
      <g transform="translate(108 30)">
        <rect x="-20" y="-18" width="58" height="40" rx="13" fill="#fffaf0" stroke="rgba(122,79,42,.14)" strokeWidth="2" />
        <circle cx="-4" cy="2" r="3.4" fill="#f2a93b" />
        <circle cx="9" cy="2" r="3.4" fill="#5bbd6a" />
        <circle cx="22" cy="2" r="3.4" fill="#2f93cf" />
        <path d="M-14 18 L-20 30 L-2 21 Z" fill="#fffaf0" />
      </g>

      {/* tail */}
      <path d="M44 118 q-26 4 -30 -16 q14 8 22 -2 q2 12 8 18 Z" fill="url(#croc-body)" />

      {/* graduated back ridge plates */}
      <path d="M26 80 l7 -11 l7 11 Z" fill="#3a8f48" />
      <path d="M37 75 l6 -9 l6 9 Z" fill="#46a455" opacity=".92" />
      <path d="M47 72 l5 -7 l5 7 Z" fill="#52b061" opacity=".85" />

      {/* head + snout */}
      <g>
        <ellipse cx="74" cy="92" rx="48" ry="34" fill="url(#croc-body)" />
        {/* lower snout */}
        <rect x="40" y="96" width="86" height="26" rx="13" fill="url(#croc-snout)" />
        {/* upper snout */}
        <rect x="40" y="78" width="92" height="24" rx="12" fill="url(#croc-body)" />
        {/* nostrils */}
        <circle cx="122" cy="84" r="3" fill="#2f7a3c" />
        <circle cx="115" cy="90" r="2.4" fill="#2f7a3c" />
        {/* teeth */}
        <path d="M48 100 l5 8 l5 -8 Z M62 100 l5 8 l5 -8 Z M76 100 l5 8 l5 -8 Z M90 100 l5 8 l5 -8 Z M104 100 l5 8 l5 -8 Z" fill="#fff" />
        {/* glossy highlight on the head */}
        <ellipse cx="70" cy="74" rx="40" ry="15" fill="url(#croc-gloss)" />
        {/* eye bumps */}
        <circle cx="58" cy="60" r="15" fill="url(#croc-body)" />
        <circle cx="84" cy="58" r="15" fill="url(#croc-body)" />
        {/* lower-lid shadow so eyes sit in the head */}
        <path d="M48 64 a10 10 0 0 0 20 0 Z" fill="rgba(47,122,60,.25)" />
        <path d="M74 62 a10 10 0 0 0 20 0 Z" fill="rgba(47,122,60,.25)" />
        <circle cx="58" cy="60" r="9.5" fill="#fffaf0" />
        <circle cx="84" cy="58" r="9.5" fill="#fffaf0" />
        <circle cx="61" cy="61" r="5" fill="#41331f" />
        <circle cx="87" cy="59" r="5" fill="#41331f" />
        <circle cx="63" cy="59" r="1.7" fill="#fff" />
        <circle cx="89" cy="57" r="1.7" fill="#fff" />
      </g>
    </svg>
  )
}

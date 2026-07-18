import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Logo } from './Logo'
import { StageScene } from './StageScene'
import { toView, type GameView } from '@shared/view'
import { t } from '../i18n'

const CONFETTI = ['#7fb069', '#f2a93b', '#e2574c', '#f8d77e', '#fffaf0']

export function Stage() {
  // Compute the view from raw state with useMemo - never return a fresh object
  // straight from a zustand selector (that breaks useSyncExternalStore).
  const mode = useStore(s => s.mode)
  const solo = useStore(s => s.solo)
  const room = useStore(s => s.room)
  const youId = useStore(s => s.youId)
  const leaveGame = useStore(s => s.leaveGame)
  const view = useMemo<GameView | null>(() => {
    if (mode === 'solo' && solo) return toView(solo, youId)
    if (mode === 'online' && room?.view) return room.view
    return null
  }, [mode, solo, room, youId])

  if (!view) {
    return (
      <div className="stage">
        <StageScene />
        <div className="stage-center" style={{ margin: 'auto' }}>
          <Logo size={120} className="host-mascot" />
          <div className="host-line">{t('Готовим сцену')}<span className="dots-anim" /></div>
        </div>
      </div>
    )
  }

  const isExplainer = view.role === 'explainer'
  const roundEnded = view.phase === 'roundEnd'

  return (
    <div className="stage">
      <StageScene />
      {roundEnded && view.solved && (
        <div className="confetti">
          {Array.from({ length: 26 }).map((_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 137) % 100}%`,
                background: CONFETTI[i % CONFETTI.length],
                animationDelay: `${(i % 8) * 0.12}s`,
                transform: `rotate(${i * 41}deg)`,
              }}
            />
          ))}
        </div>
      )}
      <div className="topbar">
        <button className="round-btn" onClick={leaveGame} aria-label={t('Выйти')}>‹</button>
        <span className="round-pill">{t('Раунд ')}{view.round}{t(' из ')}{view.totalRounds}</span>
        <TimerRing />
      </div>

      <Scoreboard view={view} />

      <div className="stage-center">
        <div className="host">
          <Logo size={84} className="host-mascot" />
          <div className="host-line">
            {roundEnded
              ? (view.solved ? <>{t('Угадал(а) ')}<b>{t(view.roundWinnerName ?? '')}</b></> : <>{t('Никто не угадал')}</>)
              : isExplainer
                ? <>{t('Ты ведущий. Намекай на слово!')}</>
                : <>{t('Ведущий: ')}<b>{t(explainerName(view))}</b></>}
          </div>
        </div>

        <span className="cat-chip"><span className="ce">{view.emoji}</span>{t(view.category)}</span>

        <WordCard view={view} roundEnded={roundEnded} isExplainer={isExplainer} />
      </div>

      <Feed view={view} />

      {roundEnded ? (
        <div className="stage-actions">
          <div className="reveal-hint-tip">{t('Следующий раунд начнётся через пару секунд')}<span className="dots-anim" /></div>
        </div>
      ) : isExplainer ? (
        <ExplainerControls view={view} />
      ) : (
        <GuessBar />
      )}
    </div>
  )
}

function explainerName(view: GameView): string {
  return view.players.find(p => p.isExplainer)?.name ?? '-'
}

function WordCard({ view, roundEnded, isExplainer }: { view: GameView; roundEnded: boolean; isExplainer: boolean }) {
  if (isExplainer || roundEnded) {
    return (
      <div className={`wordcard ${roundEnded ? 'revealed' : ''}`}>
        <div className="wc-label">{roundEnded && !isExplainer ? t('Загаданное слово') : t('Твоё слово')}</div>
        <div className="wc-word">{t(view.word ?? '')}</div>
      </div>
    )
  }
  return (
    <div className="wordcard">
      <div className="wc-label">{t('Угадай слово')}</div>
      <div className="wordmask">
        {Array.from({ length: Math.max(3, view.wordLength) }).map((_, i) => <i key={i} />)}
      </div>
    </div>
  )
}

function Scoreboard({ view }: { view: GameView }) {
  const roundEnded = view.phase === 'roundEnd'
  return (
    <div className="scoreboard">
      {view.players.map(p => {
        const won = roundEnded && p.id === view.roundWinnerId
        return (
          <div key={p.id} className={`score-chip ${p.isExplainer ? 'explaining' : ''} ${won ? 'scored' : ''}`}>
            <span className="av">{initial(p.name)}</span>
            <span className="nm">{p.id === view.youId ? t('Ты') : t(p.name)}</span>
            {p.isExplainer && <span className="mic">🎤</span>}
            <span className="sc">{p.score}</span>
          </div>
        )
      })}
    </div>
  )
}

function Feed({ view }: { view: GameView }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [view.revealed, view.guessFeed.length, view.phase])

  // Only the publicly revealed hints belong in the feed (the explainer's view
  // carries the full list, so slice it down to what everyone can see).
  const shown = view.hints.slice(0, view.revealed)
  const nothing = shown.length === 0 && view.guessFeed.length === 0

  return (
    <div className="feed" ref={ref}>
      {nothing && (
        <div className="feed-empty">
          <Logo size={64} className="host-mascot" />
          <div style={{ marginTop: 8 }}>
            {view.role === 'explainer'
              ? t('Открой первую подсказку, чтобы помочь угадать')
              : t('Ждём первую подсказку от ведущего…')}
          </div>
        </div>
      )}
      {shown.map((h, i) => (
        <div key={`h${i}`} className="bubble">
          <div className="b-name">💡 {t('Подсказка ')}{i + 1}</div>
          <div className="b-text">{t(h)}</div>
        </div>
      ))}
      {view.guessFeed.map((g, i) => (
        <div key={`g${i}`} className={`bubble ${g.you ? 'you' : ''} ${g.correct ? 'correct' : ''}`}>
          {!g.you && <div className="b-name">{t(g.name)}</div>}
          <div className="b-text">{g.correct ? `✅ ${t(g.text)}` : t(g.text)}</div>
        </div>
      ))}
    </div>
  )
}

function ExplainerControls({ view }: { view: GameView }) {
  const revealHint = useStore(s => s.revealHint)
  const giveUp = useStore(s => s.giveUp)
  const nextHint = view.hints[view.revealed] // explainer sees the full list
  const allOut = view.revealed >= view.totalHints

  return (
    <div className="stage-actions">
      {!allOut && nextHint && (
        <div className="reveal-hint-tip">{t('Следующая подсказка: «')}{t(nextHint)}{t('»')}</div>
      )}
      {allOut ? (
        <button className="btn cream block lg" onClick={giveUp}>{t('Открыть слово 🐊')}</button>
      ) : (
        <button className="btn block lg" onClick={revealHint}>
          {t('Открыть подсказку')} ({view.revealed + 1}/{view.totalHints})
        </button>
      )}
      <button className="btn ghost" style={{ alignSelf: 'center', padding: '8px 20px', color: 'var(--ink-soft)' }} onClick={giveUp}>
        {t('Сдаться')}
      </button>
    </div>
  )
}

function GuessBar() {
  const submitGuess = useStore(s => s.submitGuess)
  const [text, setText] = useState('')

  function send() {
    const g = text.trim()
    if (!g) return
    submitGuess(g)
    setText('')
  }

  return (
    <div className="guessbar">
      <input
        className="guess-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') send() }}
        placeholder={t('Введи свою догадку…')}
        maxLength={40}
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint="send"
      />
      <button className="guess-send" onClick={send} aria-label={t('Отправить')}>➤</button>
    </div>
  )
}

function TimerRing() {
  const deadline = useStore(s => s.deadline)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!deadline) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [deadline])

  if (!deadline) return <span style={{ width: 46 }} />
  const total = 70_000
  const remain = Math.max(0, deadline - now)
  const secs = Math.ceil(remain / 1000)
  const frac = Math.max(0, Math.min(1, remain / total))
  const r = 19
  const circ = 2 * Math.PI * r
  const low = secs <= 10

  return (
    <div className={`timer-ring ${low ? 'low' : ''}`}>
      <svg width="46" height="46">
        <circle cx="23" cy="23" r={r} fill="none" stroke="rgba(122,79,42,.14)" strokeWidth="5" />
        <circle
          cx="23" cy="23" r={r} fill="none"
          stroke={low ? 'var(--red)' : 'var(--green)'} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)}
          style={{ transition: 'stroke-dashoffset .3s linear' }}
        />
      </svg>
      <span className="t-num">{secs}</span>
    </div>
  )
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

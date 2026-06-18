import { useEffect } from 'react'
import { useStore } from './store'
import { Home } from './screens/Home'
import { Stage } from './screens/Stage'
import { Lobby } from './screens/Lobby'
import { Rules } from './screens/Rules'
import { Leaderboard } from './screens/Leaderboard'
import { Logo } from './screens/Logo'
import { APP_NAME } from './brand'
import type { Difficulty } from '@shared/bots'

const CONFETTI = ['#5bbd6a', '#f4be2c', '#e1554b', '#2f93cf', '#f8d77e']
const DIFFS: { d: Difficulty; t: string; s: string; emoji: string }[] = [
  { d: 'easy', t: 'Легко', s: 'Спокойная партия', emoji: '🌱' },
  { d: 'medium', t: 'Средне', s: 'Достойные соперники', emoji: '🎯' },
  { d: 'hard', t: 'Сложно', s: 'Безжалостные боты', emoji: '🔥' },
]

export function App() {
  const ready = useStore(s => s.ready)
  const screen = useStore(s => s.screen)
  const init = useStore(s => s.init)

  useEffect(() => { init() }, [init])

  if (!ready) {
    return (
      <div className="app">
        <div className="home" style={{ justifyContent: 'center' }}>
          <div className="brand" style={{ animation: 'pop-in .5s ease both' }}>
            <Logo />
            <div className="brand-name">{APP_NAME}</div>
            <div className="brand-tag">Загадываем слово<span className="dots-anim" /></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {screen === 'home' && <Home />}
      {screen === 'game' && <Stage />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'rules' && <Rules />}
      {screen === 'leaderboard' && <Leaderboard />}
      <Overlays />
    </div>
  )
}

function Overlays() {
  const difficultyPick = useStore(s => s.difficultyPick)
  const result = useStore(s => s.result)
  const toast = useStore(s => s.toast)
  const fly = useStore(s => s.fly)
  const startSolo = useStore(s => s.startSolo)
  const createRoom = useStore(s => s.createRoom)

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      {fly && <div className="flychip" style={{ color: fly.tone === 'bad' ? 'var(--red-deep)' : 'var(--green-deep)' }}>{fly.text}</div>}

      {difficultyPick && (
        <div className="scrim center" onClick={() => useStore.setState({ difficultyPick: null })}>
          <div className="sheet pop" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 44, textAlign: 'center' }}>🐊</div>
            <h2 style={{ textAlign: 'center', marginTop: 2 }}>Выбери сложность</h2>
            <div style={{ color: 'var(--ink-soft)', fontWeight: 800, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
              {difficultyPick === 'friends' ? 'Так будут играть боты, что займут пустые места' : 'Насколько сообразительны боты'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
              {DIFFS.map(({ d, t, s, emoji }) => (
                <button
                  key={d}
                  className="tile"
                  onClick={() => (difficultyPick === 'friends' ? createRoom(d) : startSolo(d))}
                >
                  <span className="tile-emoji">{emoji}</span>
                  <span className="tile-text">
                    <span className="tile-title">{t}</span>
                    <span className="tile-sub">{s}</span>
                  </span>
                  <span className="tile-chev">›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {result && <ResultModal />}
    </>
  )
}

function ResultModal() {
  const result = useStore(s => s.result)!
  const mode = useStore(s => s.mode)
  const startSolo = useStore(s => s.startSolo)
  const leaveGame = useStore(s => s.leaveGame)
  const won = result.youWon

  return (
    <div className="scrim center">
      {won && (
        <div className="confetti">
          {Array.from({ length: 40 }).map((_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 137) % 100}%`,
                background: CONFETTI[i % CONFETTI.length],
                animationDelay: `${(i % 10) * 0.12}s`,
                transform: `rotate(${i * 35}deg)`,
              }}
            />
          ))}
        </div>
      )}
      <div className="sheet pop result">
        <div className="result-emoji">{won ? '🏆' : '🐊'}</div>
        <h1>{won ? 'Ты победил!' : `Победил ${result.winnerName}`}</h1>
        <div className="result-sub">{won ? `Твой счёт: ${result.youScore}` : 'В следующий раз повезёт!'}</div>

        <div className="standings">
          {result.standings.map((p, i) => (
            <div className={`standing ${i === 0 ? 'top' : ''}`} key={p.id}>
              <span className="rk">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
              <span className="nm">{p.you ? 'Ты' : p.name}</span>
              <span className="sc">{p.score}</span>
            </div>
          ))}
        </div>

        {won && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <span className="coin-chip">🪙 +{25 + Math.round(result.youScore / 4)} монет</span>
          </div>
        )}

        <button className="btn block lg" onClick={mode === 'online' ? leaveGame : () => startSolo()}>
          {mode === 'online' ? 'В меню' : 'Играть ещё 🐊'}
        </button>
        <button className="btn ghost block" style={{ marginTop: 10 }} onClick={leaveGame}>Домой</button>
      </div>
    </div>
  )
}

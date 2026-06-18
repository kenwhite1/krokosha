import { useState } from 'react'
import { useStore } from '../store'
import { shareLink, haptic } from '../telegram'
import { APP_NAME } from '../brand'

export function Lobby() {
  const room = useStore(s => s.room)
  const profile = useStore(s => s.profile)
  const botUsername = useStore(s => s.botUsername)
  const startRoom = useStore(s => s.startRoom)
  const joinRoom = useStore(s => s.joinRoom)
  const leaveGame = useStore(s => s.leaveGame)
  const go = useStore(s => s.go)
  const busy = useStore(s => s.busy)
  const joinError = useStore(s => s.joinError)
  const [code, setCode] = useState('')

  // came from "Войти по коду" with no room yet -> join form
  if (!room) {
    return (
      <div className="lobby rise">
        <div className="page-head" style={{ width: '100%', maxWidth: 420 }}>
          <button className="round-btn" onClick={() => go('home')} aria-label="Назад">‹</button>
          <h1>Войти по коду</h1>
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <input
            className="code-input"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
            placeholder="КОД"
            inputMode="text"
            autoCapitalize="characters"
            maxLength={4}
          />
        </div>
        {joinError && <div style={{ color: 'var(--red-deep)', fontWeight: 800, marginTop: 12 }}>{joinError}</div>}
        <button
          className="btn block lg"
          style={{ maxWidth: 420, marginTop: 16 }}
          disabled={code.length !== 4 || busy}
          onClick={() => joinRoom(code)}
        >
          Войти в комнату
        </button>
      </div>
    )
  }

  const players = room.room.players
  const isHost = !room.room.quick && room.room.hostId === `u${profile?.id}`
  const link = `https://t.me/${botUsername}?startapp=room_${room.room.code}`

  if (room.room.quick) {
    return (
      <div className="lobby rise">
        <div className="code-card">
          <div style={{ fontSize: 48 }} className="searching-bob">🔎</div>
          <h2 style={{ marginTop: 6 }}>Ищем соперников<span className="dots-anim" /></h2>
          <div style={{ color: 'var(--ink-soft)', fontWeight: 800, marginTop: 6 }}>
            Подбираем игроков. Партия начнётся сама через пару секунд.
          </div>
        </div>
        <div className="seatlist">
          {players.map(p => (
            <div className="seat" key={p.id}>
              <span className="av">{p.name.charAt(0).toUpperCase()}</span>
              <span className="nm">{p.id === `u${profile?.id}` ? 'Ты' : p.name}</span>
            </div>
          ))}
        </div>
        <button className="btn ghost block" style={{ maxWidth: 420, marginTop: 18 }} onClick={leaveGame}>Отмена</button>
      </div>
    )
  }

  return (
    <div className="lobby rise">
      <div className="page-head" style={{ width: '100%', maxWidth: 420 }}>
        <button className="round-btn" onClick={leaveGame} aria-label="Назад">‹</button>
        <h1>Комната</h1>
      </div>

      <div className="code-card">
        <div style={{ fontWeight: 800 }}>Код комнаты</div>
        <div className="code-big">{room.room.code}</div>
        <div style={{ color: 'var(--ink-soft)', fontWeight: 800, fontSize: 14 }}>
          Поделись кодом с друзьями. Пустые места займут боты.
        </div>
        <button
          className="btn accent block"
          style={{ marginTop: 14 }}
          onClick={() => { haptic('tap'); shareLink(link, `Заходи в «${APP_NAME}»! Код комнаты: ${room.room.code}`) }}
        >
          Пригласить друзей 📨
        </button>
      </div>

      <div className="seatlist">
        {players.map(p => (
          <div className="seat" key={p.id}>
            <span className="av">{p.name.charAt(0).toUpperCase()}</span>
            <span className="nm">{p.id === `u${profile?.id}` ? 'Ты' : p.name}</span>
            {p.isHost ? <span className="tag host">Хост</span> : p.isBot ? <span className="tag bot">Бот</span> : <span className="tag wait">Готов</span>}
          </div>
        ))}
      </div>

      {isHost ? (
        <button className="btn block lg" style={{ maxWidth: 420, marginTop: 18 }} disabled={busy} onClick={startRoom}>
          Начать игру 🐊
        </button>
      ) : (
        <div style={{ color: 'var(--ink-soft)', fontWeight: 800, marginTop: 18, textAlign: 'center' }}>
          Ждём, пока хост начнёт игру<span className="dots-anim" />
        </div>
      )}
    </div>
  )
}

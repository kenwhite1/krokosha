import { useStore } from '../store'
import { t } from '../i18n'

export function Leaderboard() {
  const go = useStore(s => s.go)
  const rows = useStore(s => s.leaderboard)
  const profile = useStore(s => s.profile)

  return (
    <div className="page rise">
      <div className="page-head">
        <button className="round-btn" onClick={() => go('home')} aria-label={t('Назад')}>‹</button>
        <h1>{t('Рейтинг')}</h1>
      </div>
      {profile && (
        <div className="code-card" style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 900, color: 'var(--ink)' }}>{profile.name}</div>
          <div className="stat-strip" style={{ marginTop: 12 }}>
            <div className="stat-pill"><div className="v">{profile.wins}</div><div className="l">{t('Победы')}</div></div>
            <div className="stat-pill"><div className="v">{profile.played}</div><div className="l">{t('Партий')}</div></div>
            <div className="stat-pill"><div className="v">{profile.bestStreak}</div><div className="l">{t('Рекорд')}</div></div>
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="empty-note">{t('Пока пусто. Сыграй партию, чтобы попасть в таблицу!')}</div>
      ) : (
        <div className="board">
          {rows.map((r, i) => (
            <div className="board-row" key={i}>
              <span className="rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
              <span className="nm">{r.name}</span>
              <span className="wins">{r.wins} 🏆</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

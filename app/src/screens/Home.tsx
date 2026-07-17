import { useStore } from '../store'
import { Logo } from './Logo'
import { APP_NAME } from '../brand'
import { t, getLang, setLang } from '../i18n'

export function Home() {
  const profile = useStore(s => s.profile)
  const quickMatch = useStore(s => s.quickMatch)
  const go = useStore(s => s.go)
  const busy = useStore(s => s.busy)
  const lang = getLang()

  return (
    <div className="home rise">
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 4 }}>
        {(['ru', 'en'] as const).map(l => (
          <button
            key={l}
            onClick={() => setLang(l)}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 999,
              padding: '5px 12px', fontWeight: 900, fontSize: 12,
              background: lang === l ? 'var(--green)' : 'rgba(122,79,42,.12)',
              color: lang === l ? '#fff' : 'var(--ink-soft)',
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="brand">
        <Logo />
        <div className="brand-name">{t(APP_NAME)}</div>
        <div className="brand-tag">{t('Намекай, угадывай и набирай очки')}</div>
      </div>

      {profile && (
        <div className="stat-strip">
          <div className="stat-pill"><div className="v">{profile.wins}</div><div className="l">{t('Победы')}</div></div>
          <div className="stat-pill"><div className="v">{profile.streak}</div><div className="l">{t('Серия')}</div></div>
          <div className="stat-pill"><div className="v">{profile.coins}</div><div className="l">{t('Монеты')}</div></div>
        </div>
      )}

      <div className="menu-spacer" />

      <div className="menu">
        <button className="tile primary" onClick={() => useStore.setState({ difficultyPick: 'solo' })}>
          <span className="tile-emoji">🐊</span>
          <span className="tile-text">
            <span className="tile-title">{t('Одиночная игра')}</span>
            <span className="tile-sub">{t('Против ботов, выбери сложность')}</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile" onClick={quickMatch} disabled={busy}>
          <span className="tile-emoji">⚡</span>
          <span className="tile-text">
            <span className="tile-title">{t('Быстрая игра')}</span>
            <span className="tile-sub">{t('Случайные соперники онлайн')}</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile" onClick={() => useStore.setState({ difficultyPick: 'friends' })} disabled={busy}>
          <span className="tile-emoji">👥</span>
          <span className="tile-text">
            <span className="tile-title">{t('Игра с друзьями')}</span>
            <span className="tile-sub">{t('Создай комнату и поделись кодом')}</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile" onClick={() => go('lobby')}>
          <span className="tile-emoji">🔢</span>
          <span className="tile-text">
            <span className="tile-title">{t('Войти по коду')}</span>
            <span className="tile-sub">{t('Введи код из 4 символов')}</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <div style={{ display: 'flex', gap: 13 }}>
          <button className="tile" style={{ flex: 1 }} onClick={() => { go('leaderboard'); useStore.getState().loadLeaderboard() }}>
            <span className="tile-emoji">🏆</span>
            <span className="tile-text"><span className="tile-title">{t('Рейтинг')}</span></span>
          </button>
          <button className="tile" style={{ flex: 1 }} onClick={() => go('rules')}>
            <span className="tile-emoji">📖</span>
            <span className="tile-text"><span className="tile-title">{t('Правила')}</span></span>
          </button>
        </div>
      </div>
    </div>
  )
}

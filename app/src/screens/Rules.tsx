import { useStore } from '../store'
import { t } from '../i18n'

const RULES = [
  { ic: '🎤', t: 'Один ведущий за раунд', b: 'Каждый раунд один игрок становится ведущим и получает тайное слово. По очереди им будут все.' },
  { ic: '💡', t: 'Подсказки по одной', b: 'Ведущий открывает ассоциации к слову по одной. Чем меньше подсказок, тем ценнее догадка.' },
  { ic: '⌨️', t: 'Угадывай первым', b: 'Остальные пишут догадки в поле ответа. Кто угадал первым, забирает очки за раунд.' },
  { ic: '⭐', t: 'Меньше подсказок, больше очков', b: 'За раннюю догадку очки получают и угадавший, и ведущий. Тяните с подсказками с умом.' },
  { ic: '🏆', t: 'Побеждает счёт', b: 'Партия идёт несколько раундов. Кто набрал больше всех очков, тот и победил.' },
  { ic: '🤖', t: 'Боты и друзья', b: 'Играй с ботами в одиночку, ищи случайных соперников или зови друзей в комнату по коду.' },
]

export function Rules() {
  const go = useStore(s => s.go)
  return (
    <div className="page rise">
      <div className="page-head">
        <button className="round-btn" onClick={() => go('home')} aria-label={t('Назад')}>‹</button>
        <h1>{t('Как играть')}</h1>
      </div>
      {RULES.map((r, i) => (
        <div className="rule" key={i}>
          <span className="ic">{r.ic}</span>
          <div>
            <div className="rt">{t(r.t)}</div>
            <div className="rb">{t(r.b)}</div>
          </div>
        </div>
      ))}
      <button
        className="btn block lg"
        style={{ marginTop: 8 }}
        onClick={() => useStore.setState({ difficultyPick: 'solo' })}
      >
        {t('Сыграть 🐊')}
      </button>
    </div>
  )
}

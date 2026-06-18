import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createGame,
  applyAction,
  isCorrectGuess,
  normalize,
  pointsForReveal,
  type GameState,
} from './engine'
import { toView } from './view'
import { WORDS } from './words'

function game(): GameState {
  return createGame({
    players: [
      { id: 'a', name: 'Аня', isBot: false },
      { id: 'b', name: 'Боря', isBot: true },
      { id: 'c', name: 'Витя', isBot: true },
    ],
    seed: 12345,
    totalRounds: 3,
  })
}

test('новая игра стартует в фазе объяснения с первым словом', () => {
  const s = game()
  assert.equal(s.phase, 'explaining')
  assert.equal(s.round, 1)
  assert.equal(s.explainer, 0)
  assert.ok(s.word.length > 0)
  assert.equal(s.hints.length, 5)
  assert.equal(s.revealed, 0)
})

test('детерминизм: одинаковый seed -> одинаковая колода', () => {
  assert.deepEqual(game().deck, game().deck)
})

test('нормализация и сравнение ответов терпит регистр, ё и опечатки', () => {
  assert.equal(normalize('Ёжик'), 'ежик')
  assert.ok(isCorrectGuess('Ёжик', 'ежик'))
  assert.ok(isCorrectGuess('Крокодил', 'крокодил '))
  assert.ok(isCorrectGuess('Крокодил', 'кракодил')) // одна опечатка
  assert.ok(!isCorrectGuess('Кот', 'пёс'))
})

test('ведущий не может угадывать своё слово', () => {
  const s = game()
  const r = applyAction(s, { type: 'guess', playerId: 'a', text: s.word })
  assert.equal(r.error, 'explainer_cannot_guess')
})

test('правильный ответ закрывает раунд и начисляет очки обоим', () => {
  const s = game()
  const r = applyAction(s, { type: 'guess', playerId: 'b', text: s.word })
  assert.equal(r.error, undefined)
  assert.equal(r.state.phase, 'roundEnd')
  assert.equal(r.state.roundWinnerId, 'b')
  const guesser = r.state.players.find(p => p.id === 'b')!
  const explainer = r.state.players.find(p => p.id === 'a')!
  assert.equal(guesser.score, pointsForReveal(0))
  assert.ok(explainer.score > 0)
  assert.ok(r.events.some(e => e.kind === 'correct'))
})

test('меньше подсказок -> больше очков', () => {
  assert.ok(pointsForReveal(0) > pointsForReveal(3))
  assert.equal(pointsForReveal(0), 100)
  assert.ok(pointsForReveal(5) >= 20)
})

test('reveal открывает подсказки только ведущему и не больше пяти', () => {
  let s = game()
  const notHost = applyAction(s, { type: 'reveal', playerId: 'b' })
  assert.equal(notHost.error, 'not_explainer')
  for (let i = 0; i < 5; i++) s = applyAction(s, { type: 'reveal', playerId: 'a' }).state
  assert.equal(s.revealed, 5)
  const extra = applyAction(s, { type: 'reveal', playerId: 'a' })
  assert.equal(extra.error, 'no_more_hints')
})

test('timeout и giveUp закрывают раунд без победителя', () => {
  const t = applyAction(game(), { type: 'timeout' })
  assert.equal(t.state.phase, 'roundEnd')
  assert.equal(t.state.solved, false)
  const g = applyAction(game(), { type: 'giveUp', playerId: 'a' })
  assert.equal(g.state.phase, 'roundEnd')
})

test('next вращает ведущего и завершает игру после всех раундов', () => {
  let s = game()
  // раунд 1 -> 2
  s = applyAction(s, { type: 'timeout' }).state
  s = applyAction(s, { type: 'next' }).state
  assert.equal(s.round, 2)
  assert.equal(s.explainer, 1)
  // раунд 2 -> 3
  s = applyAction(s, { type: 'timeout' }).state
  s = applyAction(s, { type: 'next' }).state
  assert.equal(s.round, 3)
  // раунд 3 -> finished
  s = applyAction(s, { type: 'timeout' }).state
  const fin = applyAction(s, { type: 'next' })
  assert.equal(fin.state.phase, 'finished')
  assert.ok(fin.state.winnerId)
  assert.ok(fin.events.some(e => e.kind === 'gameEnd'))
})

test('view прячет слово от угадывающих и показывает ведущему', () => {
  const s = game()
  const explainerView = toView(s, 'a')
  const guesserView = toView(s, 'b')
  assert.equal(explainerView.role, 'explainer')
  assert.ok(explainerView.word)
  assert.equal(explainerView.hints.length, 5)
  assert.equal(guesserView.role, 'guesser')
  assert.equal(guesserView.word, null)
  assert.equal(guesserView.hints.length, 0) // ещё ничего не открыто
})

test('view раскрывает слово всем в конце раунда', () => {
  const s = applyAction(game(), { type: 'timeout' }).state
  assert.ok(toView(s, 'b').word)
})

test('у каждого слова пять непустых подсказок без самого слова', () => {
  for (const w of WORDS) {
    assert.equal(w.hints.length, 5, `${w.word}: должно быть 5 подсказок`)
    for (const h of w.hints) {
      assert.ok(h.trim().length > 0, `${w.word}: пустая подсказка`)
      assert.ok(
        !normalize(h).includes(normalize(w.word)),
        `${w.word}: подсказка содержит само слово -> "${h}"`,
      )
    }
  }
})

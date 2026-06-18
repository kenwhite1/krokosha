// --- Движок «Крокоши» (чистый, детерминированный) --------------------------
// Игра в ассоциации: каждый раунд один игрок — ВЕДУЩИЙ. Он получает тайное
// слово и открывает к нему подсказки по одной. Остальные угадывают словом в
// текстовом поле. Кто угадал первым, тот забирает очки; чем меньше подсказок
// открыто к этому моменту — тем больше очков получают и угадавший, и ведущий.
//
// Движок ничего не знает о таймерах и сети: драйвер (стор на клиенте для соло
// и комната на сервере для онлайна) сам решает, когда прислать reveal/timeout,
// а движок лишь проверяет ход и возвращает новое состояние + события.

import { makeRng, shuffle } from './rng'
import { WORDS } from './words'

export type Phase = 'explaining' | 'roundEnd' | 'finished'

export interface Player {
  id: string
  name: string
  isBot: boolean
  score: number
}

export interface GuessEntry {
  playerId: string
  name: string
  text: string
  correct: boolean
}

export interface GameState {
  players: Player[]
  rngState: number
  deck: number[] // перемешанные индексы в WORDS
  round: number // 1-based
  totalRounds: number
  explainer: number // индекс ведущего в players

  phase: Phase
  word: string
  category: string
  emoji: string
  hints: string[]
  revealed: number // сколько подсказок открыто (0..hints.length)

  guessFeed: GuessEntry[]
  roundWinnerId: string | null
  lastPoints: number // очки угадавшего за только что закрытый раунд
  solved: boolean
  winnerId: string | null

  log: { text: string }[]
}

export type Action =
  | { type: 'reveal'; playerId: string }
  | { type: 'guess'; playerId: string; text: string }
  | { type: 'giveUp'; playerId: string }
  | { type: 'timeout' }
  | { type: 'next' }

export type GameEvent =
  | { kind: 'reveal'; index: number }
  | { kind: 'correct'; playerId: string; name: string; points: number }
  | { kind: 'wrong'; playerId: string; name: string }
  | { kind: 'roundEnd'; solved: boolean; word: string }
  | { kind: 'gameEnd'; winnerId: string | null }

export interface ApplyResult {
  state: GameState
  events: GameEvent[]
  error?: string
}

// --- очки -------------------------------------------------------------------
const BASE = 100
const STEP = 18
const MIN_POINTS = 20
const EXPLAINER_SHARE = 0.5

export function pointsForReveal(revealed: number): number {
  return Math.max(MIN_POINTS, BASE - STEP * revealed)
}

// --- сравнение ответа -------------------------------------------------------
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]/gi, '')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const prev = new Array(n + 1)
  const cur = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j]
  }
  return prev[n]
}

// Принимаем точное совпадение и мелкие опечатки (1 правка для слов длиннее 4).
export function isCorrectGuess(word: string, guess: string): boolean {
  const w = normalize(word)
  const g = normalize(guess)
  if (!g) return false
  if (g === w) return true
  if (w.length > 4 && Math.abs(w.length - g.length) <= 1 && levenshtein(w, g) <= 1) return true
  return false
}

// --- создание игры ----------------------------------------------------------
export function createGame(opts: {
  players: { id: string; name: string; isBot: boolean }[]
  seed: number
  totalRounds?: number
}): GameState {
  const rng = makeRng(opts.seed)
  const deck = shuffle(
    WORDS.map((_, i) => i),
    rng,
  )
  const totalRounds = Math.max(1, opts.totalRounds ?? Math.max(3, opts.players.length))
  const state: GameState = {
    players: opts.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot, score: 0 })),
    rngState: rng.state,
    deck,
    round: 1,
    totalRounds,
    explainer: 0,
    phase: 'explaining',
    word: '',
    category: '',
    emoji: '',
    hints: [],
    revealed: 0,
    guessFeed: [],
    roundWinnerId: null,
    lastPoints: 0,
    solved: false,
    winnerId: null,
    log: [],
  }
  loadRound(state)
  return state
}

function loadRound(s: GameState): void {
  const entry = WORDS[s.deck[(s.round - 1) % s.deck.length]]
  s.word = entry.word
  s.category = entry.category
  s.emoji = entry.emoji
  s.hints = entry.hints.slice()
  s.revealed = 0
  s.guessFeed = []
  s.roundWinnerId = null
  s.solved = false
  s.phase = 'explaining'
}

function pushLog(s: GameState, text: string): void {
  s.log.push({ text })
  if (s.log.length > 40) s.log.shift()
}

function explainerId(s: GameState): string {
  return s.players[s.explainer]?.id ?? ''
}

// --- применение хода --------------------------------------------------------
export function applyAction(state: GameState, action: Action): ApplyResult {
  const s = clone(state)
  const events: GameEvent[] = []

  switch (action.type) {
    case 'reveal': {
      if (s.phase !== 'explaining') return err(state, 'not_explaining')
      if (action.playerId !== explainerId(s)) return err(state, 'not_explainer')
      if (s.revealed >= s.hints.length) return err(state, 'no_more_hints')
      s.revealed++
      events.push({ kind: 'reveal', index: s.revealed - 1 })
      pushLog(s, `Подсказка ${s.revealed}: ${s.hints[s.revealed - 1]}`)
      break
    }

    case 'guess': {
      if (s.phase !== 'explaining') return err(state, 'not_explaining')
      if (action.playerId === explainerId(s)) return err(state, 'explainer_cannot_guess')
      const p = s.players.find(pl => pl.id === action.playerId)
      if (!p) return err(state, 'not_in_game')
      const text = action.text.slice(0, 40)
      const correct = isCorrectGuess(s.word, text)
      s.guessFeed.push({ playerId: p.id, name: p.name, text, correct })
      if (s.guessFeed.length > 30) s.guessFeed.shift()
      if (correct) {
        const pts = pointsForReveal(s.revealed)
        p.score += pts
        const ex = s.players[s.explainer]
        if (ex) ex.score += Math.round(pts * EXPLAINER_SHARE)
        s.solved = true
        s.roundWinnerId = p.id
        s.lastPoints = pts
        s.phase = 'roundEnd'
        events.push({ kind: 'correct', playerId: p.id, name: p.name, points: pts })
        events.push({ kind: 'roundEnd', solved: true, word: s.word })
        pushLog(s, `${p.name} угадал(а): ${s.word} (+${pts})`)
      } else {
        events.push({ kind: 'wrong', playerId: p.id, name: p.name })
      }
      break
    }

    case 'giveUp': {
      if (s.phase !== 'explaining') return err(state, 'not_explaining')
      if (action.playerId !== explainerId(s)) return err(state, 'not_explainer')
      s.phase = 'roundEnd'
      s.solved = false
      events.push({ kind: 'roundEnd', solved: false, word: s.word })
      pushLog(s, `Никто не угадал. Слово: ${s.word}`)
      break
    }

    case 'timeout': {
      if (s.phase !== 'explaining') return err(state, 'not_explaining')
      s.phase = 'roundEnd'
      s.solved = false
      events.push({ kind: 'roundEnd', solved: false, word: s.word })
      pushLog(s, `Время вышло. Слово: ${s.word}`)
      break
    }

    case 'next': {
      if (s.phase !== 'roundEnd') return err(state, 'not_round_end')
      if (s.round >= s.totalRounds) {
        s.phase = 'finished'
        s.winnerId = decideWinner(s)
        events.push({ kind: 'gameEnd', winnerId: s.winnerId })
        pushLog(s, 'Игра окончена')
      } else {
        s.round++
        s.explainer = (s.explainer + 1) % s.players.length
        loadRound(s)
      }
      break
    }

    default:
      return err(state, 'unknown_action')
  }

  return { state: s, events }
}

function decideWinner(s: GameState): string | null {
  let best: Player | null = null
  for (const p of s.players) {
    if (!best || p.score > best.score) best = p
  }
  return best ? best.id : null
}

function clone(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map(p => ({ ...p })),
    deck: s.deck.slice(),
    hints: s.hints.slice(),
    guessFeed: s.guessFeed.map(g => ({ ...g })),
    log: s.log.map(l => ({ ...l })),
  }
}

function err(state: GameState, error: string): ApplyResult {
  return { state, events: [], error }
}

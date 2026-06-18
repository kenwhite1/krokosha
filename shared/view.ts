// Урезанная, готовая к отрисовке проекция GameState для одного игрока.
// Ведущий видит слово и все подсказки; угадывающим слово прячется (до конца
// раунда), и им видны только уже открытые подсказки.

import type { GameState, Phase } from './engine'

export interface ViewPlayer {
  id: string
  name: string
  isBot: boolean
  score: number
  isExplainer: boolean
  isWinner: boolean
}

export interface ViewGuess {
  name: string
  text: string
  correct: boolean
  you: boolean
}

export interface GameView {
  youId: string
  role: 'explainer' | 'guesser'
  phase: Phase
  round: number
  totalRounds: number
  category: string
  emoji: string
  hints: string[] // видимые подсказки (все — ведущему, открытые — угадывающим)
  revealed: number
  totalHints: number
  word: string | null // ведущему всегда; угадывающим — только в конце раунда
  wordLength: number
  players: ViewPlayer[]
  guessFeed: ViewGuess[]
  roundWinnerId: string | null
  roundWinnerName: string | null
  lastPoints: number
  solved: boolean
  canReveal: boolean
  log: string[]
}

export function toView(s: GameState, youId: string): GameView {
  const isExplainer = s.players[s.explainer]?.id === youId
  const roundEnded = s.phase === 'roundEnd' || s.phase === 'finished'
  const showWord = isExplainer || roundEnded
  const winner = s.players.find(p => p.id === s.roundWinnerId) ?? null

  return {
    youId,
    role: isExplainer ? 'explainer' : 'guesser',
    phase: s.phase,
    round: s.round,
    totalRounds: s.totalRounds,
    category: s.category,
    emoji: s.emoji,
    hints: isExplainer ? s.hints.slice() : s.hints.slice(0, s.revealed),
    revealed: s.revealed,
    totalHints: s.hints.length,
    word: showWord ? s.word : null,
    wordLength: s.word.replace(/[^a-zа-яё]/gi, '').length,
    players: s.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      score: p.score,
      isExplainer: i === s.explainer,
      isWinner: s.winnerId === p.id,
    })),
    guessFeed: s.guessFeed.slice(-12).map(g => ({
      name: g.name,
      text: g.text,
      correct: g.correct,
      you: g.playerId === youId,
    })),
    roundWinnerId: s.roundWinnerId,
    roundWinnerName: winner?.name ?? null,
    lastPoints: s.lastPoints,
    solved: s.solved,
    canReveal: isExplainer && s.phase === 'explaining' && s.revealed < s.hints.length,
    log: s.log.slice(-6).map(l => l.text),
  }
}

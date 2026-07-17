// --- Боты «Крокоши» ---------------------------------------------------------
// Боты умеют и ВЕДУЩИМ открывать подсказки, и УГАДЫВАЮЩИМ присылать ответы.
// Поведение зависит от сложности. Тайминги нарочно «человеческие» и побиваемые:
// живой игрок всегда может успеть угадать раньше бота. В быстрых играх боты
// маскируются под обычных игроков, поэтому их реакции выглядят естественно.

import { WORDS } from './words'
import { isCorrectGuess } from './engine'

export type Difficulty = 'easy' | 'medium' | 'hard'

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

// Пауза между подсказками, когда ведущий - бот (мс).
export function botRevealIntervalMs(d: Difficulty): number {
  if (d === 'easy') return rand(2600, 3900) // щедрый: открывает быстро
  if (d === 'hard') return rand(5200, 7400) // скупой: заставляет думать
  return rand(3800, 5600)
}

// Вероятность того, что бот-угадывающий «знает» слово при стольких открытых
// подсказках. Чем выше сложность, тем раньше и увереннее он угадывает.
function guessProb(d: Difficulty, revealed: number): number {
  if (d === 'hard') return revealed <= 0 ? 0.12 : revealed === 1 ? 0.5 : revealed === 2 ? 0.82 : 0.96
  if (d === 'easy') return revealed <= 2 ? 0.05 : revealed === 3 ? 0.4 : revealed === 4 ? 0.66 : 0.86
  return revealed <= 1 ? 0.08 : revealed === 2 ? 0.46 : revealed === 3 ? 0.76 : 0.92
}

// Задержка реакции бота перед отправкой ответа (мс) - оставляет человеку шанс.
function guessDelay(d: Difficulty): number {
  if (d === 'hard') return rand(1300, 2600)
  if (d === 'easy') return rand(3200, 6000)
  return rand(2200, 4200)
}

// Шанс, что бот сперва ляпнет неверное слово (живее выглядит).
function wrongChance(d: Difficulty): number {
  if (d === 'hard') return 0.07
  if (d === 'easy') return 0.34
  return 0.18
}

export interface GuessPlan {
  delayMs: number
  wrong: boolean
}

// Решает, попробует ли бот угадать на текущем числе открытых подсказок.
// Возвращает null, если на этом шаге бот промолчит (попробует на следующей подсказке).
export function botGuessPlan(d: Difficulty, revealed: number): GuessPlan | null {
  if (Math.random() > guessProb(d, revealed)) return null
  return { delayMs: guessDelay(d), wrong: Math.random() < wrongChance(d) }
}

// Случайное «не то» слово для правдоподобной ошибки.
// Фильтруем кандидатов через isCorrectGuess, чтобы случайно не «угадать»
// близкое по написанию слово.
export function botWrongGuess(excludeWord: string): string {
  const pool = WORDS.filter(w => w.word !== excludeWord && !isCorrectGuess(excludeWord, w.word))
  return pool[Math.floor(Math.random() * pool.length)]?.word ?? 'дом'
}

// Лёгкое дрожание интервала, чтобы несколько ботов не отвечали синхронно.
export function jitter(ms: number): number {
  return ms + rand(-250, 450)
}

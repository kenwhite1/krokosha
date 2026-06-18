// --- Менеджер онлайн-комнат ------------------------------------------------
// Авторитетные на сервере партии в памяти (один инстанс на Railway). Соло —
// полностью на клиенте и в этом модуле не нуждается; комнаты добавляют слой
// «играй с друзьями».
//
// Два вида комнат:
//   * friend  — создаётся по коду; пустые места заполняются (видимыми) ботами
//   * quick   — публичный подбор; стартует сам и заполняется ботами, которых
//               клиент видит как обычных игроков.
//
// Драйвер раунда живёт здесь: он крутит таймер раунда, за ведущего-бота
// открывает подсказки, а ботам-угадывающим раздаёт правдоподобные ответы.

import { createGame, applyAction, type GameState, type Action } from '../../shared/engine'
import {
  botRevealIntervalMs,
  botGuessPlan,
  botWrongGuess,
  jitter,
  type Difficulty,
} from '../../shared/bots'
import { toView } from '../../shared/view'
import type { RoomStateDto, RoomDto } from '../../shared/types'
import { recordResult } from './profiles'

interface Seat {
  id: string // id игрока в движке: 'u<tgid>' для людей, 'bot1'... для ботов
  tgId: number | null
  name: string
  isBot: boolean
  isHost: boolean
  lastSeen: number
  difficulty: Difficulty
}

interface Room {
  code: string
  hostTgId: number
  seats: Seat[]
  game: GameState | null
  version: number
  maxPlayers: number
  createdAt: number
  lastActivity: number
  quick: boolean
  scored: boolean
  difficulty: Difficulty // сложность ботов в friend-комнате
  deadline: number | null // когда текущий раунд закончится сам
  roundId: number // растёт каждый раунд; гасит «протухшие» таймеры
  timers: Set<ReturnType<typeof setTimeout>>
  startTimer: ReturnType<typeof setTimeout> | null
}

const rooms = new Map<string, Room>()
const MAX = 5
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // без легко путаемых символов
const QUICK_DELAY = 6000 // окно подбора перед авто-стартом quick-комнаты
const ROUND_MS = 70_000 // длительность раунда
const ROUND_END_PAUSE = 5200 // пауза показа ответа перед следующим раундом

const BOT_NAMES = ['Аня', 'Боря', 'Витя', 'Галя', 'Дина', 'Жора']
const HUMAN_NAMES = [
  'Максим', 'Лена', 'Дима', 'Соня', 'Костя', 'Вера', 'Паша', 'Юля',
  'Олег', 'Катя', 'Рома', 'Настя', 'Игорь', 'Маша', 'Артём', 'Поля',
]

function newCode(): string {
  let code = ''
  do {
    code = ''
    for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  } while (rooms.has(code))
  return code
}

function seatFor(room: Room, tgId: number): Seat | undefined {
  return room.seats.find(s => s.tgId === tgId)
}

function pickQuickDiff(): Difficulty {
  const r = Math.random()
  return r < 0.3 ? 'easy' : r < 0.8 ? 'medium' : 'hard'
}

// --- таймеры драйвера -------------------------------------------------------
function schedule(room: Room, ms: number, fn: () => void): void {
  const t = setTimeout(() => {
    room.timers.delete(t)
    try {
      fn()
    } catch (e) {
      console.error('room timer error', e)
    }
  }, ms)
  room.timers.add(t)
}

function clearRoundTimers(room: Room): void {
  for (const t of room.timers) clearTimeout(t)
  room.timers.clear()
}

function doAction(room: Room, action: Action): void {
  if (!room.game) return
  const res = applyAction(room.game, action)
  if (res.error) return
  room.game = res.state
  room.version++
  room.lastActivity = Date.now()
}

// заполняем стол ботами. quick — человеческие имена и разная сложность, чтобы
// читались как живые; friend — обычные боты с именами-табличками.
function fillBots(room: Room): void {
  const used = new Set(room.seats.map(s => s.name))
  const pool = room.quick ? HUMAN_NAMES : BOT_NAMES
  let b = room.seats.filter(s => s.isBot).length + 1
  let pi = Math.floor(Math.random() * pool.length)
  while (room.seats.length < room.maxPlayers) {
    let name = pool[pi % pool.length]
    let tries = 0
    while (used.has(name) && tries++ < pool.length) name = pool[++pi % pool.length]
    used.add(name)
    room.seats.push({
      id: `bot${b++}`,
      tgId: null,
      name,
      isBot: true,
      isHost: false,
      lastSeen: Date.now(),
      difficulty: room.quick ? pickQuickDiff() : room.difficulty,
    })
    pi++
  }
}

function beginGame(room: Room): void {
  if (room.startTimer) {
    clearTimeout(room.startTimer)
    room.startTimer = null
  }
  fillBots(room)
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
  room.game = createGame({
    players: room.seats.map(s => ({ id: s.id, name: s.name, isBot: s.isBot })),
    seed,
    totalRounds: Math.max(3, room.seats.length),
  })
  room.scored = false
  room.version++
  room.lastActivity = Date.now()
  startRoundDriver(room)
}

// --- драйвер раунда ---------------------------------------------------------
function startRoundDriver(room: Room): void {
  if (!room.game || room.game.phase !== 'explaining') return
  clearRoundTimers(room)
  room.roundId++
  const rid = room.roundId
  room.deadline = Date.now() + ROUND_MS

  // жёсткий таймаут раунда
  schedule(room, ROUND_MS + 300, () => {
    if (room.roundId !== rid || !room.game || room.game.phase !== 'explaining') return
    doAction(room, { type: 'timeout' })
    afterRoundEnd(room, rid)
  })

  const exSeat = room.seats[room.game.explainer]
  if (exSeat?.isBot) scheduleBotReveal(room, rid, exSeat.difficulty)
  scheduleBotGuesses(room, rid)
}

function scheduleBotReveal(room: Room, rid: number, diff: Difficulty): void {
  schedule(room, botRevealIntervalMs(diff), () => {
    if (room.roundId !== rid || !room.game || room.game.phase !== 'explaining') return
    const ex = room.seats[room.game.explainer]
    if (!ex?.isBot) return
    if (room.game.revealed < room.game.hints.length) {
      doAction(room, { type: 'reveal', playerId: ex.id })
      scheduleBotGuesses(room, rid) // новая подсказка — новые попытки угадать
    }
    if (room.game.phase !== 'explaining') return
    if (room.game.revealed < room.game.hints.length) {
      scheduleBotReveal(room, rid, diff)
    } else {
      // подсказки кончились, а слово не угадали: даём последний шанс, потом сдаёмся
      schedule(room, 4200, () => {
        if (room.roundId !== rid || !room.game || room.game.phase !== 'explaining') return
        doAction(room, { type: 'giveUp', playerId: ex.id })
        afterRoundEnd(room, rid)
      })
    }
  })
}

function scheduleBotGuesses(room: Room, rid: number): void {
  if (!room.game || room.game.phase !== 'explaining') return
  const revealed = room.game.revealed
  const word = room.game.word
  const exId = room.seats[room.game.explainer]?.id
  for (const seat of room.seats) {
    if (!seat.isBot || seat.id === exId) continue
    const plan = botGuessPlan(seat.difficulty, revealed)
    if (!plan) continue
    schedule(room, jitter(plan.delayMs), () => {
      if (room.roundId !== rid || !room.game || room.game.phase !== 'explaining') return
      const text = plan.wrong ? botWrongGuess(word) : word
      doAction(room, { type: 'guess', playerId: seat.id, text })
      if (room.game && room.game.phase !== 'explaining') afterRoundEnd(room, rid)
    })
  }
}

// вызывается после того, как раунд закрылся (угадали / время / сдались)
function afterRoundEnd(room: Room, rid: number): void {
  if (!room.game) return
  if (room.game.phase === 'finished') {
    finalize(room)
    return
  }
  if (room.game.phase !== 'roundEnd') return
  room.deadline = null
  schedule(room, ROUND_END_PAUSE, () => {
    if (room.roundId !== rid || !room.game || room.game.phase !== 'roundEnd') return
    doAction(room, { type: 'next' })
    if (String(room.game.phase) === 'finished') finalize(room)
    else startRoundDriver(room)
  })
}

function finalize(room: Room): void {
  clearRoundTimers(room)
  room.deadline = null
  if (!room.game || room.game.phase !== 'finished' || room.scored) return
  room.scored = true
  for (const seat of room.seats) {
    if (seat.isBot || seat.tgId == null) continue
    const me = room.game.players.find(p => p.id === seat.id)
    const won = room.game.winnerId === seat.id
    recordResult(seat.tgId, 'online', won, me?.score ?? 0)
  }
}

// --- DTO --------------------------------------------------------------------
function roomDto(room: Room): RoomDto {
  return {
    code: room.code,
    hostId: room.quick ? '' : `u${room.hostTgId}`,
    started: !!room.game,
    maxPlayers: room.maxPlayers,
    quick: room.quick,
    players: room.seats.map(s => ({
      id: s.id,
      name: s.name,
      isBot: room.quick ? false : s.isBot, // quick никогда не выдаёт ботов
      isHost: room.quick ? false : s.isHost,
      connected: s.isBot || Date.now() - s.lastSeen < 15000,
    })),
  }
}

function stateFor(room: Room, tgId: number): RoomStateDto {
  const seat = seatFor(room, tgId)
  let view = room.game && seat ? toView(room.game, seat.id) : null
  if (view && room.quick) {
    view = { ...view, players: view.players.map(p => ({ ...p, isBot: false })) }
  }
  return {
    room: roomDto(room),
    version: room.version,
    view,
    deadline: room.deadline,
  }
}

// --- публичный API ----------------------------------------------------------
export function createRoom(tgId: number, name: string, difficulty: Difficulty = 'medium'): RoomStateDto {
  const code = newCode()
  const room: Room = {
    code,
    hostTgId: tgId,
    seats: [{ id: `u${tgId}`, tgId, name, isBot: false, isHost: true, lastSeen: Date.now(), difficulty }],
    game: null,
    version: 1,
    maxPlayers: MAX,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    quick: false,
    scored: false,
    difficulty,
    deadline: null,
    roundId: 0,
    timers: new Set(),
    startTimer: null,
  }
  rooms.set(code, room)
  return stateFor(room, tgId)
}

export function joinRoom(code: string, tgId: number, name: string): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'no_room' }
  if (room.game) return { error: 'already_started' }
  const existing = seatFor(room, tgId)
  if (existing) {
    existing.lastSeen = Date.now()
    return stateFor(room, tgId)
  }
  const humans = room.seats.filter(s => !s.isBot).length
  if (humans >= room.maxPlayers) return { error: 'full' }
  room.seats.push({ id: `u${tgId}`, tgId, name, isBot: false, isHost: false, lastSeen: Date.now(), difficulty: room.difficulty })
  room.version++
  room.lastActivity = Date.now()
  return stateFor(room, tgId)
}

// Публичный подбор: подсаживаем в открытую quick-комнату или открываем новую,
// которая стартует сама через короткое окно (заполняясь скрытыми ботами).
export function quickMatch(tgId: number, name: string): RoomStateDto {
  for (const room of rooms.values()) {
    if (!room.quick || room.game) continue
    const seat = seatFor(room, tgId)
    if (seat) {
      seat.lastSeen = Date.now()
      return stateFor(room, tgId)
    }
    const humans = room.seats.filter(s => !s.isBot).length
    if (humans >= room.maxPlayers) continue
    room.seats.push({ id: `u${tgId}`, tgId, name, isBot: false, isHost: false, lastSeen: Date.now(), difficulty: 'medium' })
    room.version++
    room.lastActivity = Date.now()
    if (room.seats.filter(s => !s.isBot).length >= room.maxPlayers) beginGame(room)
    return stateFor(room, tgId)
  }
  const code = newCode()
  const room: Room = {
    code,
    hostTgId: tgId,
    seats: [{ id: `u${tgId}`, tgId, name, isBot: false, isHost: true, lastSeen: Date.now(), difficulty: 'medium' }],
    game: null,
    version: 1,
    maxPlayers: MAX,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    quick: true,
    scored: false,
    difficulty: 'medium',
    deadline: null,
    roundId: 0,
    timers: new Set(),
    startTimer: null,
  }
  rooms.set(code, room)
  room.startTimer = setTimeout(() => {
    const r = rooms.get(code)
    if (r && !r.game) beginGame(r)
  }, QUICK_DELAY)
  return stateFor(room, tgId)
}

export function startRoom(code: string, tgId: number): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'no_room' }
  if (room.hostTgId !== tgId) return { error: 'not_host' }
  if (room.game) return { error: 'already_started' }
  beginGame(room)
  return stateFor(room, tgId)
}

export function actInRoom(code: string, tgId: number, action: Action): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room || !room.game) return { error: 'no_game' }
  const seat = seatFor(room, tgId)
  if (!seat) return { error: 'not_in_room' }
  // человек может действовать только от своего места
  if ('playerId' in action && action.playerId !== seat.id) return { error: 'not_your_seat' }
  // и не может присылать служебные действия
  if (action.type === 'timeout' || action.type === 'next') return { error: 'forbidden' }
  seat.lastSeen = Date.now()

  const before = room.version
  doAction(room, action)
  if (room.version === before) return { error: 'illegal' }

  if (room.game && room.game.phase !== 'explaining') afterRoundEnd(room, room.roundId)
  else if (action.type === 'reveal') scheduleBotGuesses(room, room.roundId) // подсказка ускоряет ботов

  return stateFor(room, tgId)
}

export function getRoomState(code: string, tgId: number): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'no_room' }
  const seat = seatFor(room, tgId)
  if (seat) seat.lastSeen = Date.now()
  return stateFor(room, tgId)
}

export function leaveRoom(code: string, tgId: number): void {
  const room = rooms.get(code.toUpperCase())
  if (!room) return
  if (!room.game) {
    // still in the lobby: just drop the seat (delete the room if no humans remain)
    room.seats = room.seats.filter(s => s.tgId !== tgId)
    if (room.seats.filter(s => !s.isBot).length === 0) {
      if (room.startTimer) clearTimeout(room.startTimer)
      clearRoundTimers(room)
      rooms.delete(code.toUpperCase())
    } else room.version++
    return
  }
  // mid-game: hand the seat to a bot so the round driver keeps it alive
  // (otherwise a vacated explainer would stall every round on the 70s timeout).
  const seat = seatFor(room, tgId)
  if (!seat || seat.isBot) return
  seat.isBot = true
  seat.tgId = null
  seat.difficulty = room.quick ? 'medium' : room.difficulty
  room.version++
  room.lastActivity = Date.now()
  if (room.seats.every(s => s.isBot)) {
    // nobody human left to watch: tear the room down
    clearRoundTimers(room)
    rooms.delete(code.toUpperCase())
    return
  }
  if (room.game.phase === 'explaining') {
    if (room.seats[room.game.explainer]?.id === seat.id) scheduleBotReveal(room, room.roundId, seat.difficulty)
    scheduleBotGuesses(room, room.roundId)
  }
}

// уборка простаивающих комнат каждые 10 мин (30 мин простоя — удаляем)
setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > 30 * 60_000) {
      if (room.startTimer) clearTimeout(room.startTimer)
      clearRoundTimers(room)
      rooms.delete(code)
    }
  }
}, 10 * 60_000).unref?.()

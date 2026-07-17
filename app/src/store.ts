import { create } from 'zustand'
import {
  createGame,
  applyAction,
  type GameState,
  type Action,
  type GameEvent,
} from '@shared/engine'
import {
  botRevealIntervalMs,
  botGuessPlan,
  botWrongGuess,
  jitter,
  type Difficulty,
} from '@shared/bots'
import { toView, type GameView } from '@shared/view'
import type { Profile, RoomStateDto } from '@shared/types'
import { api } from './api'
import { haptic } from './telegram'
import { playSfx } from './sound'
import { t, getLang } from './i18n'
import { EN } from './strings'

type Screen = 'home' | 'rules' | 'leaderboard' | 'lobby' | 'game'

// Reverse lookup (English word -> Russian source word), so a player guessing
// in English still matches the engine, which compares against the RU word.
const EN_TO_RU: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const [ru, en] of Object.entries(EN)) {
    const k = en.toLowerCase().trim()
    if (!(k in m)) m[k] = ru
  }
  return m
})()

interface Standing { id: string; name: string; score: number; you: boolean }
interface FinalInfo { youWon: boolean; youScore: number; winnerName: string; standings: Standing[] }

interface S {
  ready: boolean
  screen: Screen
  mode: 'solo' | 'online' | null
  profile: Profile | null
  botUsername: string

  solo: GameState | null
  youId: string

  room: RoomStateDto | null
  joinError: string | null
  busy: boolean
  deadline: number | null

  toast: string | null
  fly: { id: number; text: string; tone: 'good' | 'bad' } | null
  result: FinalInfo | null
  difficulty: Difficulty
  difficultyPick: 'solo' | 'friends' | null
  leaderboard: { name: string; wins: number; played: number }[]

  // actions
  init(): Promise<void>
  go(s: Screen): void
  startSolo(difficulty?: Difficulty): void
  view(): GameView | null
  revealHint(): void
  submitGuess(text: string): void
  giveUp(): void
  leaveGame(): void
  loadLeaderboard(): Promise<void>
  quickMatch(): Promise<void>
  createRoom(difficulty?: Difficulty): Promise<void>
  joinRoom(code: string): Promise<void>
  startRoom(): Promise<void>
}

const ROUND_MS = 70_000
const ROUND_END_PAUSE = 5200

// module-scoped timers (kept out of state to avoid re-renders)
let roundTimer: ReturnType<typeof setTimeout> | null = null
let revealTimer: ReturnType<typeof setTimeout> | null = null
let nextTimer: ReturnType<typeof setTimeout> | null = null
let guessTimers: ReturnType<typeof setTimeout>[] = []
let pollTimer: ReturnType<typeof setInterval> | null = null
let soloRoundId = 0
let flyId = 0
// Прогон соло-партии: id заводится на старте и служит хабу ключом идемпотентности
// (соло-партий сервер не ведёт). telepath - успел угадать меньше чем за 10 секунд.
let soloRunId = ''
let soloTelepath = false

function clearSoloTimers() {
  if (roundTimer) clearTimeout(roundTimer)
  if (revealTimer) clearTimeout(revealTimer)
  if (nextTimer) clearTimeout(nextTimer)
  for (const t of guessTimers) clearTimeout(t)
  roundTimer = revealTimer = nextTimer = null
  guessTimers = []
}
function stopPoll() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

export const useStore = create<S>((set, get) => {
  // -- event presentation (flash / sound) ----------------------------------
  function present(events: GameEvent[], youId: string) {
    for (const e of events) {
      switch (e.kind) {
        case 'reveal': playSfx('reveal'); break
        case 'wrong': if (e.playerId === youId) playSfx('wrong'); break
        case 'correct':
          playSfx('correct')
          flash(e.playerId === youId ? `${t('Угадал! +')}${e.points}` : `${t(e.name)}: +${e.points}`, 'good')
          break
        case 'roundEnd': break
        case 'gameEnd': break
      }
    }
  }
  function flash(text: string, tone: 'good' | 'bad') {
    const id = ++flyId
    set({ fly: { id, text, tone } })
    setTimeout(() => { if (get().fly?.id === id) set({ fly: null }) }, 950)
  }
  function toast(text: string) {
    const msg = t(text)
    set({ toast: msg })
    setTimeout(() => { if (get().toast === msg) set({ toast: null }) }, 1700)
  }

  // -- SOLO driver ---------------------------------------------------------
  function soloApply(action: Action) {
    const s = get().solo
    if (!s) return
    const r = applyAction(s, action)
    if (r.error) { haptic('warn'); return }
    const deadline = get().deadline
    set({ solo: r.state })
    present(r.events, get().youId)

    // «Телепат»: сам угадал слово меньше чем за 10 секунд от начала раунда.
    if (action.type === 'guess' && deadline != null && r.state.roundWinnerId === get().youId) {
      if (ROUND_MS - (deadline - Date.now()) < 10_000) soloTelepath = true
    }

    if (r.state.phase === 'finished') { finishGame(r.state); return }
    if (r.state.phase === 'roundEnd') {
      if (nextTimer) clearTimeout(nextTimer)
      nextTimer = setTimeout(() => soloApply({ type: 'next' }), ROUND_END_PAUSE)
      if (revealTimer) clearTimeout(revealTimer)
      for (const t of guessTimers) clearTimeout(t)
      guessTimers = []
      return
    }
    // still explaining
    if (action.type === 'next') beginSoloRound()
    else if (action.type === 'reveal') scheduleSoloGuesses(soloRoundId)
  }

  function beginSoloRound() {
    const s = get().solo
    if (!s || s.phase !== 'explaining') return
    clearSoloTimers()
    soloRoundId++
    const rid = soloRoundId
    set({ deadline: Date.now() + ROUND_MS })
    roundTimer = setTimeout(() => {
      if (soloRoundId !== rid) return
      const g = get().solo
      if (g && g.phase === 'explaining') soloApply({ type: 'timeout' })
    }, ROUND_MS + 200)

    const ex = s.players[s.explainer]
    if (ex.isBot) scheduleSoloReveal(rid)
    scheduleSoloGuesses(rid)
  }

  function scheduleSoloReveal(rid: number) {
    const diff = get().difficulty
    revealTimer = setTimeout(() => {
      if (soloRoundId !== rid) return
      const s = get().solo
      if (!s || s.phase !== 'explaining') return
      const ex = s.players[s.explainer]
      if (!ex.isBot) return
      if (s.revealed < s.hints.length) {
        soloApply({ type: 'reveal', playerId: ex.id })
      }
      const after = get().solo
      if (!after || after.phase !== 'explaining') return
      if (after.revealed < after.hints.length) {
        scheduleSoloReveal(rid)
      } else {
        revealTimer = setTimeout(() => {
          if (soloRoundId !== rid) return
          const g = get().solo
          if (g && g.phase === 'explaining') soloApply({ type: 'giveUp', playerId: g.players[g.explainer].id })
        }, 4200)
      }
    }, botRevealIntervalMs(diff))
  }

  function scheduleSoloGuesses(rid: number) {
    const s = get().solo
    if (!s || s.phase !== 'explaining') return
    const diff = get().difficulty
    const exId = s.players[s.explainer].id
    const revealed = s.revealed
    const word = s.word
    for (const p of s.players) {
      if (!p.isBot || p.id === exId) continue
      const plan = botGuessPlan(diff, revealed)
      if (!plan) continue
      const t = setTimeout(() => {
        if (soloRoundId !== rid) return
        const g = get().solo
        if (!g || g.phase !== 'explaining') return
        const text = plan.wrong ? botWrongGuess(word) : word
        soloApply({ type: 'guess', playerId: p.id, text })
      }, jitter(plan.delayMs))
      guessTimers.push(t)
    }
  }

  function finishGame(s: GameState) {
    clearSoloTimers()
    set({ deadline: null })
    const youId = get().youId
    const standings = standingsOf(s, youId)
    const me = s.players.find(p => p.id === youId)
    const youWon = s.winnerId === youId
    const winner = s.players.find(p => p.id === s.winnerId)
    playSfx(youWon ? 'win' : 'lose')
    haptic(youWon ? 'success' : 'warn')
    set({ result: { youWon, youScore: me?.score ?? 0, winnerName: winner?.name ?? '-', standings } })
    api
      .soloResult({
        won: youWon,
        score: me?.score ?? 0,
        runId: soloRunId,
        players: s.players.length,
        telepath: soloTelepath,
      })
      .then(r => set({ profile: r.profile }))
      .catch(() => {})
  }

  // -- ONLINE driver -------------------------------------------------------
  function applyRoom(next: RoomStateDto) {
    const prev = get().room
    const inLobby = get().screen === 'lobby'
    set({ room: next, deadline: next.deadline })
    // a joiner learns the game started via polling: move them onto the stage.
    // Switch on `started` even if the view lags a tick, so nobody gets stuck.
    if (inLobby && next.room.started) set({ screen: 'game' })

    // detect a fresh correct guess for a little flash + sound
    const pv = prev?.view
    const nv = next.view
    if (pv && nv && nv.roundWinnerId && nv.roundWinnerId !== pv.roundWinnerId) {
      const youWon = nv.roundWinnerId === nv.youId
      playSfx(youWon ? 'correct' : 'reveal')
      if (youWon) flash(`${t('Угадал! +')}${nv.lastPoints}`, 'good')
    }
    // game finished -> show standings and stop hammering the finished room
    if (nv && nv.phase === 'finished' && prev?.view?.phase !== 'finished') {
      showOnlineFinal(nv)
      stopPoll()
    }
  }

  function showOnlineFinal(v: GameView) {
    const youWon = v.players.find(p => p.isWinner)?.id === v.youId
    const winner = v.players.find(p => p.isWinner)
    const standings: Standing[] = [...v.players]
      .sort((a, b) => b.score - a.score)
      .map(p => ({ id: p.id, name: p.name, score: p.score, you: p.id === v.youId }))
    const me = v.players.find(p => p.id === v.youId)
    playSfx(youWon ? 'win' : 'lose')
    haptic(youWon ? 'success' : 'warn')
    set({ result: { youWon, youScore: me?.score ?? 0, winnerName: winner?.name ?? '-', standings } })
    api.profile().then(r => set({ profile: r.profile })).catch(() => {})
  }

  function startPoll(code: string) {
    stopPoll()
    pollTimer = setInterval(async () => {
      try {
        const st = await api.roomState(code)
        applyRoom(st)
      } catch { /* transient */ }
    }, 1100)
  }

  async function onlineAct(action: Action) {
    const room = get().room
    if (!room) return
    try {
      const st = await api.roomAction(room.room.code, action)
      applyRoom(st)
    } catch (e) {
      const code = (e as { data?: { error?: string } })?.data?.error
      if (code && code !== 'illegal' && code !== 'not_explaining') { haptic('warn'); toast('Не получилось, попробуй ещё') }
    }
  }

  function meId(): string {
    return get().mode === 'solo' ? get().youId : (get().room?.view?.youId ?? '')
  }

  return {
    ready: false,
    screen: 'home',
    mode: null,
    profile: null,
    botUsername: 'krokosha_play_bot',
    solo: null,
    youId: 'you',
    room: null,
    joinError: null,
    busy: false,
    deadline: null,
    toast: null,
    fly: null,
    result: null,
    difficulty: 'medium',
    difficultyPick: null,
    leaderboard: [],

    async init() {
      try {
        const { profile, startParam, botUsername } = await api.auth()
        set({ profile, botUsername: botUsername || 'krokosha_play_bot', ready: true })
        if (startParam?.startsWith('room_')) {
          const code = startParam.slice(5).toUpperCase()
          if (/^[A-Z0-9]{4}$/.test(code)) await get().joinRoom(code)
        }
      } catch {
        set({ ready: true }) // still allow offline solo play
      }
    },

    go(screen) {
      haptic('tap')
      if (screen !== 'lobby' && screen !== 'game') stopPoll()
      set({ screen })
    },

    startSolo(difficulty) {
      clearSoloTimers()
      stopPoll()
      const youId = 'you'
      const players = [
        { id: youId, name: get().profile?.name ?? 'Ты', isBot: false },
        { id: 'bot1', name: 'Аня', isBot: true },
        { id: 'bot2', name: 'Боря', isBot: true },
        { id: 'bot3', name: 'Витя', isBot: true },
      ]
      const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
      soloRunId = `${Date.now().toString(36)}-${seed.toString(36)}`
      soloTelepath = false
      const game = createGame({ players, seed, totalRounds: 4 })
      set({
        mode: 'solo', youId, solo: game, screen: 'game',
        result: null, difficultyPick: null, room: null,
        difficulty: difficulty ?? get().difficulty,
      })
      haptic('tap')
      beginSoloRound()
    },

    view() {
      const st = get()
      if (st.mode === 'solo' && st.solo) return toView(st.solo, st.youId)
      if (st.mode === 'online' && st.room?.view) return st.room.view
      return null
    },

    revealHint() {
      const v = get().view()
      if (!v || !v.canReveal) return
      haptic('tap')
      if (get().mode === 'solo') soloApply({ type: 'reveal', playerId: meId() })
      else onlineAct({ type: 'reveal', playerId: meId() })
    },

    submitGuess(text) {
      const v = get().view()
      if (!v || v.role !== 'guesser' || v.phase !== 'explaining') return
      const clean = text.trim()
      if (!clean) return
      haptic('select')
      // In English mode, map a recognized English guess back to its Russian
      // source word so the engine (which stores RU words) accepts it.
      const forEngine = getLang() === 'en' ? (EN_TO_RU[clean.toLowerCase()] ?? clean) : clean
      if (get().mode === 'solo') soloApply({ type: 'guess', playerId: meId(), text: forEngine })
      else onlineAct({ type: 'guess', playerId: meId(), text: forEngine })
    },

    giveUp() {
      const v = get().view()
      if (!v || v.role !== 'explainer' || v.phase !== 'explaining') return
      haptic('tap')
      if (get().mode === 'solo') soloApply({ type: 'giveUp', playerId: meId() })
      else onlineAct({ type: 'giveUp', playerId: meId() })
    },

    leaveGame() {
      clearSoloTimers()
      const room = get().room
      if (room && get().mode === 'online') api.roomLeave(room.room.code).catch(() => {})
      stopPoll()
      set({ mode: null, solo: null, room: null, result: null, deadline: null, screen: 'home' })
      haptic('tap')
    },

    async loadLeaderboard() {
      try {
        const r = await api.leaderboard()
        set({ leaderboard: r.top })
      } catch { /* offline */ }
    },

    async quickMatch() {
      set({ busy: true, joinError: null })
      try {
        const st = await api.roomQuick()
        set({ mode: 'online', room: st, screen: 'lobby', result: null, busy: false, deadline: st.deadline })
        startPoll(st.room.code)
      } catch {
        set({ busy: false, joinError: 'Не удалось подобрать игру. Проверь связь.' })
      }
    },

    async createRoom(difficulty) {
      const diff = difficulty ?? get().difficulty
      set({ busy: true, joinError: null })
      try {
        const st = await api.roomCreate(diff)
        set({ mode: 'online', room: st, screen: 'lobby', result: null, busy: false, difficultyPick: null, difficulty: diff })
        startPoll(st.room.code)
      } catch {
        set({ busy: false, joinError: 'Не удалось создать комнату. Проверь связь.' })
      }
    },

    async joinRoom(code) {
      set({ busy: true, joinError: null })
      try {
        const st = await api.roomJoin(code)
        set({ mode: 'online', room: st, screen: 'lobby', result: null, busy: false, deadline: st.deadline })
        startPoll(st.room.code)
      } catch (e) {
        const err = (e as { data?: { error?: string } })?.data?.error
        set({ busy: false, joinError: err === 'no_room' ? 'Нет комнаты с таким кодом.' : err === 'already_started' ? 'Игра уже началась.' : err === 'full' ? 'В комнате нет мест.' : 'Не удалось войти.' })
      }
    },

    async startRoom() {
      const room = get().room
      if (!room) return
      set({ busy: true })
      try {
        const st = await api.roomStart(room.room.code)
        set({ room: st, screen: 'game', busy: false, deadline: st.deadline })
      } catch {
        set({ busy: false })
        toast('Не удалось начать')
      }
    },
  }
})

function standingsOf(s: GameState, youId: string): Standing[] {
  return [...s.players]
    .sort((a, b) => b.score - a.score)
    .map(p => ({ id: p.id, name: p.name, score: p.score, you: p.id === youId }))
}

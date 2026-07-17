import { Hono } from 'hono'
import { z } from 'zod'
import { validateInitData, issueToken, verifyToken } from './auth'
import type { Env } from './env'
import { getOrCreateUser, getProfile, recordResult, topPlayers } from './profiles'
import { createRoom, joinRoom, quickMatch, startRoom, actInRoom, getRoomState, leaveRoom } from './rooms'
import { storeLaunchToken, reportMatch, withHubCoins } from './gg'
import { BOT_USERNAME } from './env'
import type { Action } from '../../shared/engine'
import type { Difficulty } from '../../shared/bots'

export const api = new Hono<Env>()

api.get('/health', c => c.json({ ok: true }))

api.post('/auth', async c => {
  const body = await c.req.json<{ initData: string }>().catch(() => null)
  if (!body) return c.json({ error: 'bad_request' }, 400)
  const v = validateInitData(body.initData ?? '')
  if (!v) return c.json({ error: 'invalid_init_data' }, 401)
  const name = [v.user.first_name, v.user.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Игрок'
  getOrCreateUser(v.user.id, name, v.user.username)
  storeLaunchToken(v.user.id, v.startParam)
  const token = await issueToken(v.user.id)
  const profile = await withHubCoins(v.user.id, getProfile(v.user.id))
  return c.json({ token, profile, startParam: v.startParam, botUsername: BOT_USERNAME })
})

// шлюз авторизации для всего ниже
api.use('/*', async (c, next) => {
  if (c.req.path.endsWith('/auth') || c.req.path.endsWith('/health')) return next()
  const token = c.req.header('authorization')?.replace(/^Bearer /, '')
  const uid = token ? await verifyToken(token) : null
  if (!uid) return c.json({ error: 'unauthorized' }, 401)
  c.set('uid', uid)
  return next()
})

api.get('/profile', async c => c.json({ profile: await withHubCoins(c.get('uid'), getProfile(c.get('uid'))) }))

api.get('/leaderboard', c => c.json({ top: topPlayers(20) }))

// записать законченную соло-партию (движок крутится на клиенте, мы храним итог)
const soloSchema = z.object({
  won: z.boolean(),
  score: z.number(),
  // id прогона: заводится клиентом на старте соло-партии и переживает повтор
  // запроса. Хабу он нужен как ключ идемпотентности - сервер соло-партий не
  // ведёт, и другого стабильного идентификатора у неё нет.
  runId: z.string().max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
  // размер соло-стола (игрок + боты) - его знает только клиент
  players: z.number().int().min(1).max(16).optional(),
  // «Телепат»: игрок угадал слово меньше чем за 10 секунд.
  telepath: z.boolean().optional(),
})

api.post('/solo/result', async c => {
  const uid = c.get('uid')
  const parsed = soloSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_request' }, 400)
  const { won, runId, telepath, players } = parsed.data
  const score = Math.max(0, Math.min(9999, parsed.data.score | 0))
  const profile = recordResult(uid, 'solo', won, score)
  if (runId) {
    reportMatch({
      userId: uid,
      idempotencyKey: `croc-solo-${uid}-${runId}`,
      result: won ? 'win' : 'loss',
      placement: null,
      players: players ?? 1,
      humanPlayers: 1,
      score,
      mode: 'solo',
      opponents: [],
      stats: telepath ? { signature: true } : undefined,
    })
  }
  return c.json({ profile })
})

// --- онлайн-комнаты ---------------------------------------------------------
const difficultySchema = z.enum(['easy', 'medium', 'hard'])
const actionSchema: z.ZodType<Action> = z.union([
  z.object({ type: z.literal('reveal'), playerId: z.string() }),
  z.object({ type: z.literal('guess'), playerId: z.string(), text: z.string().max(40) }),
  z.object({ type: z.literal('giveUp'), playerId: z.string() }),
]) as z.ZodType<Action>

const nameOf = (uid: number) => getProfile(uid)?.name ?? 'Игрок'

api.post('/room/create', async c => {
  const uid = c.get('uid')
  const body = await c.req.json<{ difficulty?: Difficulty }>().catch(() => ({} as { difficulty?: Difficulty }))
  const diff = difficultySchema.safeParse(body.difficulty)
  return c.json(createRoom(uid, nameOf(uid), diff.success ? diff.data : 'medium'))
})

api.post('/room/join', async c => {
  const uid = c.get('uid')
  const body = await c.req.json<{ code: string }>().catch(() => null)
  const code = (body?.code ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{4}$/.test(code)) return c.json({ error: 'bad_code' }, 400)
  const r = joinRoom(code, uid, nameOf(uid))
  if ('error' in r) return c.json(r, 400)
  return c.json(r)
})

api.post('/room/quick', c => {
  const uid = c.get('uid')
  return c.json(quickMatch(uid, nameOf(uid)))
})

api.get('/room/:code', c => {
  const r = getRoomState(c.req.param('code'), c.get('uid'))
  if ('error' in r) return c.json(r, 404)
  return c.json(r)
})

api.post('/room/:code/start', c => {
  const r = startRoom(c.req.param('code'), c.get('uid'))
  if ('error' in r) return c.json(r, 400)
  return c.json(r)
})

api.post('/room/:code/action', async c => {
  const body = await c.req.json().catch(() => null)
  const parsed = actionSchema.safeParse(body?.action)
  if (!parsed.success) return c.json({ error: 'bad_action' }, 400)
  const r = actInRoom(c.req.param('code'), c.get('uid'), parsed.data)
  if ('error' in r) return c.json(r, 400)
  return c.json(r)
})

api.post('/room/:code/leave', c => {
  leaveRoom(c.req.param('code'), c.get('uid'))
  return c.json({ ok: true })
})

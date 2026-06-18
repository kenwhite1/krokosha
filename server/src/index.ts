import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import './db'
import { api } from './api'
import { bot, botWebhook } from './bot'
import { DEV_MODE } from './auth'

const app = new Hono()
app.route('/api', api)

const WEBHOOK_PATH = `/bot/${process.env.WEBHOOK_SECRET ?? 'hook'}`
const hook = botWebhook
if (hook) app.post(WEBHOOK_PATH, c => hook(c))

// статичный SPA (app/dist); путь должен быть относительным к cwd для serveStatic
const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', '..', 'app', 'dist')
if (existsSync(dist)) {
  const rel = relative(process.cwd(), dist)
  app.use('/*', serveStatic({ root: rel }))
  app.get('*', serveStatic({ path: join(rel, 'index.html') }))
}

const port = Number(process.env.PORT ?? 3000)
// Явно слушаем 0.0.0.0, чтобы edge-прокси платформы (Railway, Fly и т.д.) достучался.
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, async info => {
  console.log(`krokosha server listening on 0.0.0.0:${info.port}${DEV_MODE ? ' (DEV MODE, no bot token)' : ''}`)
  if (DEV_MODE && process.env.NODE_ENV === 'production') {
    console.error('ВНИМАНИЕ: BOT_TOKEN не задан в production. Авторизация отключена (DEV MODE), ' +
      'и все игроки станут одним пользователем. Задай BOT_TOKEN, иначе игра небезопасна.')
  }
  if (!DEV_MODE && (process.env.JWT_SECRET ?? '').length < 16) {
    console.warn('ВНИМАНИЕ: JWT_SECRET слишком короткий или не задан. Поставь длинную случайную строку.')
  }
  if (!process.env.APP_URL) {
    console.warn('APP_URL не задан: вебхук и кнопка Mini App не настроятся. Укажи публичный https URL.')
  }
  if (bot && process.env.APP_URL) {
    const hookUrl = `${process.env.APP_URL.replace(/\/$/, '')}${WEBHOOK_PATH}`
    try {
      await bot.api.setWebhook(hookUrl)
      console.log(`webhook set: ${hookUrl}`)
    } catch (e) {
      console.error('setWebhook failed', e)
    }
  }
})

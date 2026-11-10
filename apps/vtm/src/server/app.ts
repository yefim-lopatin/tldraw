import { mkdirSync, existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import staticPlugin from '@fastify/static'
import websocketPlugin from '@fastify/websocket'
import fastify from 'fastify'
import { isRoomId } from '../shared/dice'
import { registerHistory } from './history'
import { createRoomManager } from './rooms'

export async function buildApp(directory = resolve(process.env.DATA_DIR || './data')) {
	mkdirSync(directory, { recursive: true, mode: 0o700 })
	const assets = join(directory, 'assets')
	mkdirSync(assets, { recursive: true })
	const app = fastify()
	await app.register(websocketPlugin)
	const rooms = createRoomManager(join(directory, 'rooms'))
	app.addHook('onClose', async () => {
		rooms.close()
	})
	app.get<{ Params: { roomId: string }; Querystring: { sessionId: string } }>(
		'/connect/:roomId',
		{ websocket: true },
		(socket, req) => {
			if (
				!isRoomId(req.params.roomId) ||
				typeof req.query.sessionId !== 'string' ||
				req.query.sessionId.length > 128
			) {
				socket.close(1008, 'Некорректная комната')
				return
			}
			rooms.get(req.params.roomId).handleSocketConnect({ sessionId: req.query.sessionId, socket })
		}
	)
	registerHistory(app, directory)
	await app.register(async (uploads) => {
		uploads.removeAllContentTypeParsers()
		uploads.addContentTypeParser(
			'*',
			{ parseAs: 'buffer', bodyLimit: 30 * 1024 * 1024 },
			(_req, body, done) => done(null, body)
		)
		uploads.put<{ Params: { id: string } }>('/uploads/:id', async (req, reply) => {
			if (!/^[a-zA-Z0-9_.-]{1,160}$/.test(req.params.id) || req.params.id.startsWith('.'))
				return reply.code(400).send({})
			await writeFile(join(assets, req.params.id), req.body as Buffer)
			return { ok: true }
		})
	})
	await app.register(staticPlugin, {
		root: assets,
		prefix: '/uploads/',
		decorateReply: false,
		setHeaders: (res: ServerResponse) => {
			res.setHeader('Content-Security-Policy', "default-src 'none'")
			res.setHeader('X-Content-Type-Options', 'nosniff')
		},
	})
	const dist = fileURLToPath(new URL('../../dist', import.meta.url))
	if (existsSync(dist)) {
		await app.register(staticPlugin, { root: dist })
		app.get('/', async (_req, reply) =>
			reply.type('text/html').send(await readFile(join(dist, 'index.html')))
		)
	}
	return app
}

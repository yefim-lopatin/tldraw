import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { isRoll, isRoomId, type Roll } from '../shared/dice'

export function registerHistory(app: FastifyInstance, directory: string) {
	const keyPath = join(directory, 'owner-key')
	if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600 })
	const key = readFileSync(keyPath, 'utf8').trim()
	const hash = (value: string) => createHash('sha256').update(value).digest()
	const authorized = (req: FastifyRequest) =>
		timingSafeEqual(hash(String(req.headers['x-owner-key'] || '')), hash(key))
	const db = new DatabaseSync(join(directory, 'history.db'))
	db.exec(
		'CREATE TABLE IF NOT EXISTS rolls (room TEXT, id TEXT, payload TEXT NOT NULL, time INTEGER, PRIMARY KEY (room, id))'
	)
	app.addHook('onClose', async () => {
		db.close()
	})
	app.post('/api/dice-history/owner', async (req, reply) =>
		reply.code(authorized(req) ? 200 : 403).send({})
	)
	app.register(async (routes) => {
		routes.addHook('preHandler', async (req, reply) => {
			if (!isRoomId((req.params as { roomId: string }).roomId)) return reply.code(400).send({})
			reply.header('Cache-Control', 'no-store')
		})
		routes.get<{ Params: { roomId: string } }>('/api/dice-history/:roomId', async (req) => {
			return db
				.prepare('SELECT payload FROM rolls WHERE room = ? ORDER BY time, rowid')
				.all(req.params.roomId)
				.map((row) => JSON.parse(row.payload as string) as Roll)
		})
		routes.post<{ Params: { roomId: string } }>(
			'/api/dice-history/:roomId',
			{ bodyLimit: 8192 },
			async (req, reply) => {
				if (!isRoll(req.body)) return reply.code(400).send({ error: 'Некорректный бросок' })
				const row: Roll = { ...req.body, time: Date.now() }
				db.prepare('INSERT OR IGNORE INTO rolls (room, id, payload, time) VALUES (?, ?, ?, ?)').run(
					req.params.roomId,
					row.id,
					JSON.stringify(row),
					row.time
				)
				return { ok: true }
			}
		)
		routes.delete<{ Params: { roomId: string } }>(
			'/api/dice-history/:roomId',
			async (req, reply) => {
				if (!authorized(req)) return reply.code(403).send({})
				db.prepare('DELETE FROM rolls WHERE room = ?').run(req.params.roomId)
				return []
			}
		)
	})
}

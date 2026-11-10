import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Roll } from '../shared/dice'
import { buildApp } from './app'

const directories: string[] = []
afterEach(() => {
	for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const roll: Roll = {
	id: 'roll-one',
	sides: 10,
	results: [1, 6, 10],
	hunger: 1,
	difficulty: 0,
	username: 'Игрок',
	time: 0,
}

describe('История комнат', () => {
	it('сохраняет состязания, не дублирует броски и восстанавливает историю после перезапуска', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'vtm-history-'))
		directories.push(dir)
		let app = await buildApp(dir)
		try {
			for (let i = 0; i < 2; i++)
				expect(
					(await app.inject({ method: 'POST', url: '/api/dice-history/room-one', payload: roll }))
						.statusCode
				).toBe(200)
			expect((await app.inject('/api/dice-history/room-one')).json()).toHaveLength(1)
			expect((await app.inject('/api/dice-history/room-two')).json()).toEqual([])
			await app.close()
			app = await buildApp(dir)
			expect((await app.inject('/api/dice-history/room-one')).json()[0]).toMatchObject({
				...roll,
				time: expect.any(Number),
			})
		} finally {
			await app.close()
		}
	})
	it('разрешает очистку только ведущему и только в выбранной комнате', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'vtm-owner-'))
		directories.push(dir)
		const app = await buildApp(dir)
		try {
			for (const room of ['room-one', 'room-two'])
				await app.inject({ method: 'POST', url: `/api/dice-history/${room}`, payload: roll })
			expect(
				(await app.inject({ method: 'DELETE', url: '/api/dice-history/room-one' })).statusCode
			).toBe(403)
			expect(
				(
					await app.inject({
						method: 'POST',
						url: '/api/dice-history/owner',
						headers: { 'x-owner-key': 'wrong' },
					})
				).statusCode
			).toBe(403)
			const headers = { 'x-owner-key': readFileSync(join(dir, 'owner-key'), 'utf8').trim() }
			expect(
				(await app.inject({ method: 'POST', url: '/api/dice-history/owner', headers })).statusCode
			).toBe(200)
			expect(
				(await app.inject({ method: 'DELETE', url: '/api/dice-history/room-one', headers })).json()
			).toEqual([])
			expect((await app.inject('/api/dice-history/room-two')).json()).toHaveLength(1)
		} finally {
			await app.close()
		}
	})
	it('отклоняет неверные значения кубиков, Голода, сложности и комнаты', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'vtm-invalid-'))
		directories.push(dir)
		const app = await buildApp(dir)
		try {
			for (const change of [
				{ results: [11] },
				{ results: [] },
				{ hunger: 4 },
				{ sides: 6 },
				{ difficulty: 41 },
			]) {
				expect(
					(
						await app.inject({
							method: 'POST',
							url: '/api/dice-history/room-one',
							payload: { ...roll, ...change },
						})
					).statusCode
				).toBe(400)
			}
			expect((await app.inject('/api/dice-history/short')).statusCode).toBe(400)
		} finally {
			await app.close()
		}
	})
})

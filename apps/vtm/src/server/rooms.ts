import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteWrapper, SQLiteSyncStorage, TLSocketRoom } from '@tldraw/sync-core'
import { createTLSchema, defaultShapeSchemas, type TLRecord } from '@tldraw/tlschema'
import { diceRollProps } from '../shared/dice'

const schema = createTLSchema({
	shapes: { ...defaultShapeSchemas, 'dice-roll': { props: diceRollProps } },
})

export function createRoomManager(directory: string) {
	mkdirSync(directory, { recursive: true })
	const rooms = new Map<string, { room: TLSocketRoom<TLRecord, void>; db: DatabaseSync }>()
	return {
		get(roomId: string) {
			const existing = rooms.get(roomId)
			if (existing) return existing.room
			const db = new DatabaseSync(join(directory, `${roomId}.db`))
			const storage = new SQLiteSyncStorage<TLRecord>({ sql: new NodeSqliteWrapper(db) })
			const room = new TLSocketRoom<TLRecord, void>({
				schema,
				storage,
				onSessionRemoved(room, args) {
					if (args.numSessionsRemaining === 0) {
						room.close()
						db.close()
						rooms.delete(roomId)
					}
				},
			})
			rooms.set(roomId, { room, db })
			return room
		},
		close() {
			const active = [...rooms.values()]
			rooms.clear()
			for (const { room, db } of active) {
				room.close()
				if (db.isOpen) db.close()
			}
		},
	}
}

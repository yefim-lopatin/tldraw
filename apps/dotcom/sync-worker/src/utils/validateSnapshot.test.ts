import {
	CollectionRecordType,
	commentSchemaRecords,
	createTLSchema,
	TLRecord,
} from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import { validateSnapshot } from './validateSnapshot'

const snapshotOf = (records: object[]) =>
	Object.fromEntries(records.map((r: any) => [r.id, r])) as Record<string, TLRecord>

describe('validateSnapshot', () => {
	it('accepts a board collection', () => {
		const collection = CollectionRecordType.create({ name: 'Wireframes' })
		const result = validateSnapshot({
			schema: createTLSchema().serialize(),
			snapshot: snapshotOf([collection]),
		})
		expect(result).toEqual({ ok: true, value: { [collection.id]: collection } })
	})

	it('rejects a collection that fails validation', () => {
		const collection = { ...CollectionRecordType.create({ name: 'Wireframes' }), name: ' ' }
		const result = validateSnapshot({
			schema: createTLSchema().serialize(),
			snapshot: snapshotOf([collection]),
		})
		expect(result.ok).toBe(false)
	})

	it('rejects a comment, which is never part of a document', () => {
		const comment = { id: 'comment:1', typeName: 'comment' }
		const result = validateSnapshot({
			schema: createTLSchema({ records: commentSchemaRecords }).serialize(),
			snapshot: snapshotOf([comment]),
		})
		expect(result.ok).toBe(false)
	})
})

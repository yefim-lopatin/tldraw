import { describe, expect, it } from 'vitest'
import { createTLSchema } from '../createTLSchema'
import { AssetRecordType } from './TLAsset'
import {
	CollectionItemContentRecordType,
	collectionItemContentValidator,
	collectionItemRecordValidator,
	CollectionRecordType,
	collectionSchemaRecords,
	collectionValidator,
	createCollectionItemContentId,
	TLCollectionItemId,
	TLCollectionItemRecord,
} from './TLCollection'
import { TLShapeId } from './TLShape'

const collectionId = CollectionRecordType.createId('wireframes')
const itemId = 'collection-item:card' as TLCollectionItemId
const shapeId = 'shape:box' as TLShapeId

describe('collectionValidator', () => {
	const collection = CollectionRecordType.create({ id: collectionId, name: 'Wireframes' })

	it('accepts a collection', () => {
		expect(collectionValidator.validate(collection)).toEqual(collection)
	})

	it('accepts an owner, but not a blank one', () => {
		expect(collectionValidator.validate({ ...collection, ownerId: 'acme' })).toEqual({
			...collection,
			ownerId: 'acme',
		})
		expect(() => collectionValidator.validate({ ...collection, ownerId: ' ' })).toThrow()
	})

	it('rejects a readOnly flag, which a collection no longer has', () => {
		expect(() => collectionValidator.validate({ ...collection, readOnly: true })).toThrow()
	})

	it('rejects a blank name', () => {
		expect(() => collectionValidator.validate({ ...collection, name: '  ' })).toThrow()
	})

	it('rejects an id that is not a collection id', () => {
		expect(() => collectionValidator.validate({ ...collection, id: 'wireframes' })).toThrow()
	})

	it('rejects unknown properties', () => {
		expect(() => collectionValidator.validate({ ...collection, color: 'red' })).toThrow()
	})
})

describe('collectionItemRecordValidator', () => {
	const item: TLCollectionItemRecord = {
		id: itemId,
		typeName: 'collection-item',
		collectionId,
		name: 'Card',
		thumbnail: {
			light: AssetRecordType.createId('light'),
			dark: AssetRecordType.createId('dark'),
		},
		version: 1,
		meta: {},
	}

	it('accepts an item whose thumbnail names one asset or a light and dark pair', () => {
		expect(collectionItemRecordValidator.validate(item)).toEqual(item)
		const withOne = { ...item, thumbnail: AssetRecordType.createId('one') }
		expect(collectionItemRecordValidator.validate(withOne)).toEqual(withOne)
		const { thumbnail: _thumbnail, ...without } = item
		expect(collectionItemRecordValidator.validate(without)).toEqual(without)
	})

	it('rejects a thumbnail that is a URL rather than an asset id', () => {
		expect(() =>
			collectionItemRecordValidator.validate({ ...item, thumbnail: 'https://x/t.png' })
		).toThrow()
		expect(() =>
			collectionItemRecordValidator.validate({
				...item,
				thumbnail: { light: 'data:image/png;base64,AA', dark: 'data:image/png;base64,AA' },
			})
		).toThrow()
	})

	it('rejects a blank name and a collection id that is not a collection id', () => {
		expect(() => collectionItemRecordValidator.validate({ ...item, name: ' ' })).toThrow()
		expect(() =>
			collectionItemRecordValidator.validate({ ...item, collectionId: 'wireframes' })
		).toThrow()
	})
})

describe('collectionItemContentValidator', () => {
	const content = CollectionItemContentRecordType.create({
		id: createCollectionItemContentId(itemId),
		itemId,
		content: {
			shapes: [{ id: shapeId, type: 'geo', x: 0, y: 0, props: {} } as any],
			rootShapeIds: [shapeId],
			schema: createTLSchema().serialize(),
		},
		assetIds: [AssetRecordType.createId('photo')],
	})

	it('accepts content that names its assets', () => {
		expect(collectionItemContentValidator.validate(content)).toEqual(content)
	})

	it('rejects content that carries its assets inline', () => {
		expect(() =>
			collectionItemContentValidator.validate({
				...content,
				content: { ...content.content, assets: [] },
			})
		).toThrow()
	})

	it('rejects asset ids and root shape ids of the wrong type', () => {
		expect(() =>
			collectionItemContentValidator.validate({ ...content, assetIds: ['shape:box'] })
		).toThrow()
		expect(() =>
			collectionItemContentValidator.validate({
				...content,
				content: { ...content.content, rootShapeIds: ['page:1'] },
			})
		).toThrow()
	})
})

describe('createCollectionItemContentId', () => {
	it("keys an item's content by the item's id", () => {
		expect(createCollectionItemContentId(itemId)).toBe('collection-item-content:card')
	})
})

describe('schema registration', () => {
	const schema = createTLSchema({ records: collectionSchemaRecords })

	it('registers the three record types as document records', () => {
		const types = schema.types as Record<string, { scope: string } | undefined>
		expect(types['collection']?.scope).toBe('document')
		expect(types['collection-item']?.scope).toBe('document')
		expect(types['collection-item-content']?.scope).toBe('document')
	})

	it("can't send collection records to a schema that predates them", () => {
		const collection = CollectionRecordType.create({ id: collectionId, name: 'Wireframes' })
		const result = schema.migratePersistedRecord(
			collection as any,
			createTLSchema().serialize(),
			'down'
		)
		expect(result.type).toBe('error')
	})
})

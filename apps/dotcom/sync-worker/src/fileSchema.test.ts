import {
	AssetRecordType,
	CollectionItemContentRecordType,
	CollectionRecordType,
	createCollectionItemContentId,
	createShapeId,
	createTLSchema,
	TLCollectionItemId,
	TLCollectionItemRecord,
} from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import { collectAssetAssociationChanges } from './assetAssociation'
import { fileSnapshotSchema, fileSyncSchema } from './fileSchema'
import { validateSnapshot } from './utils/validateSnapshot'

const USER_CONTENT = 'https://tldrawusercontent.com'

// A board whose only image is kept by a collection item: no shape on the canvas uses the asset.
function boardWithCollection() {
	const asset = AssetRecordType.create({
		id: AssetRecordType.createId('photo'),
		type: 'image',
		props: {
			name: 'photo.png',
			src: `${USER_CONTENT}/abc123-png`,
			w: 10,
			h: 10,
			mimeType: 'image/png',
			isAnimated: false,
		},
		meta: { fileId: 'source-file' },
	})
	const collection = CollectionRecordType.create({ name: 'Photos' })
	const item: TLCollectionItemRecord = {
		id: 'collection-item:photo' as TLCollectionItemId,
		typeName: 'collection-item',
		collectionId: collection.id,
		thumbnail: asset.id,
		createdAt: 1,
		version: 1,
		meta: {},
	}
	const shapeId = createShapeId('photo')
	const content = CollectionItemContentRecordType.create({
		id: createCollectionItemContentId(item.id),
		itemId: item.id,
		content: {
			shapes: [{ id: shapeId, type: 'image', props: { assetId: asset.id } } as any],
			bindings: [],
			rootShapeIds: [shapeId],
			schema: createTLSchema().serialize(),
		},
		assetIds: [asset.id],
	})
	return { asset, records: [asset, collection, item, content] }
}

describe('the file schemas', () => {
	it('register the collection records in the room and in snapshots', () => {
		for (const typeName of ['collection', 'collection-item', 'collection-item-content']) {
			expect(fileSyncSchema.types).toHaveProperty(typeName)
			expect(fileSnapshotSchema.types).toHaveProperty(typeName)
		}
	})

	it('register the comment records in the room only', () => {
		expect(fileSyncSchema.types).toHaveProperty('comment')
		expect(fileSnapshotSchema.types).not.toHaveProperty('comment')
	})
})

describe('a duplicated file with board collections', () => {
	it('accepts the collection records, and copies the asset only a collection item uses', () => {
		const { asset, records } = boardWithCollection()
		const result = validateSnapshot({
			schema: createTLSchema().serialize(),
			snapshot: Object.fromEntries(records.map((r) => [r.id, r])) as any,
		})
		expect(result.ok).toBe(true)
		const store = result.ok ? result.value : {}
		expect(
			Object.values(store)
				.map((r) => r.typeName)
				.sort()
		).toEqual(['asset', 'collection', 'collection-item', 'collection-item-content'])

		const { assetsToReplace } = collectAssetAssociationChanges(Object.values(store), {
			slug: 'duplicate-file',
			userContentUrl: USER_CONTENT,
		})
		expect(assetsToReplace.map((a) => a.assetId)).toEqual([asset.id])
	})
})

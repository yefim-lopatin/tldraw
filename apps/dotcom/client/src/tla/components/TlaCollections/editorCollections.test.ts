import 'fake-indexeddb/auto'
import type { CollectionSource } from '@tldraw/collections'
import {
	AssetRecordType,
	createShapeId,
	createTLStore,
	defaultBindingUtils,
	defaultShapeUtils,
	Editor,
	type TLRecord,
} from 'tldraw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileSchemaRecords } from '../../../utils/fileSchemaRecords'
import { createCollectionsSource } from './collectionsSource'
import { getEditorCollections } from './editorCollections'

let lastUserId = 0
const cleanups: (() => void)[] = []

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup()
})

function createEditor() {
	const editor = new Editor({
		store: createTLStore({
			records: fileSchemaRecords,
			shapeUtils: defaultShapeUtils,
			bindingUtils: defaultBindingUtils,
		}),
		shapeUtils: defaultShapeUtils,
		bindingUtils: defaultBindingUtils,
		tools: [],
		getContainer: () => document.body,
	})
	cleanups.push(() => editor.dispose())
	return editor
}

function setUp() {
	const userId = `editor-collections-user-${++lastUserId}`
	const app = { userId, msg: (message: { defaultMessage: string }) => message.defaultMessage }
	const userCollections = createCollectionsSource(userId)
	cleanups.push(() => userCollections.dispose())
	const editor = createEditor()
	const source = getEditorCollections(app as any, userCollections, editor, 'file-a')
	return { app, userId, userCollections, editor, source }
}

const ofType = (editor: Editor, typeName: string) =>
	editor.store.allRecords().filter((r) => r.typeName === (typeName as TLRecord['typeName']))

const namesOf = (source: CollectionSource, ownerId: string) =>
	source
		.getCollections()
		.filter((c) => c.ownerId === ownerId)
		.map((c) => c.name)

function addImage(editor: Editor) {
	const assetId = AssetRecordType.createId('photo')
	editor.createAssets([
		AssetRecordType.create({
			id: assetId,
			type: 'image',
			props: {
				name: 'photo.png',
				src: 'https://tldrawusercontent.com/abc123-png',
				w: 10,
				h: 10,
				mimeType: 'image/png',
				isAnimated: false,
			},
			meta: { fileId: 'file-a' },
		}),
	])
	const id = createShapeId()
	editor.createShape({ id, type: 'image', props: { assetId, w: 10, h: 10 } })
	return { id, assetId }
}

describe('getEditorCollections', () => {
	it("lists the board first, then the user's own collections", () => {
		const { userId, source } = setUp()
		expect(source.getCollectionOwners?.()).toEqual([
			{ id: 'file-a', name: 'This board' },
			{ id: userId, name: 'Your collections' },
		])
		expect(namesOf(source, userId)).toEqual(['Wireframes', 'Icons'])
	})

	it('is made once per editor and file', () => {
		const { app, userCollections, editor, source } = setUp()
		expect(getEditorCollections(app as any, userCollections, editor, 'file-a')).toBe(source)
		expect(getEditorCollections(app as any, userCollections, editor, 'file-b')).not.toBe(source)
	})

	it("creates new collections among the user's own", async () => {
		const { userId, editor, source } = setUp()
		const collection = await source.createCollection('Team kit')
		expect(collection.ownerId).toBe(userId)
		expect(ofType(editor, 'collection')).toEqual([])
	})

	it("keeps a collection created for the board in the file's document", async () => {
		const { editor, source } = setUp()
		const collection = await source.createCollection('Board kit', { ownerId: 'file-a' })
		expect(collection.ownerId).toBe('file-a')
		expect(ofType(editor, 'collection')).toMatchObject([{ id: collection.id, name: 'Board kit' }])
	})

	it("moves a board collection to the user's own and back, with its image", async () => {
		const { userId, editor, source } = setUp()
		const { id, assetId } = addImage(editor)
		const collection = await source.createCollection('Photos', { ownerId: 'file-a' })
		await source.addItem(collection.id, {
			content: { formatVersion: 1, content: editor.getContentFromCurrentPage([id])! },
		})

		await source.moveCollection!(collection.id, userId)
		expect(ofType(editor, 'collection')).toEqual([])
		const moved = source.getCollections().find((c) => c.name === 'Photos')!
		expect(moved.ownerId).toBe(userId)
		const [userItem] = source.getItems(moved.id)
		const userContent = await source.getItemContent(userItem.id)
		expect(userContent.content.assets.map((a) => a.id)).toEqual([assetId])

		editor.store.remove([assetId])
		await source.moveCollection!(moved.id, 'file-a')
		expect(namesOf(source, 'file-a')).toEqual(['Photos'])
		expect(ofType(editor, 'asset').map((a) => a.id)).toEqual([assetId])
	})

	it("keeps a board collection out of the user's own collections across a reload", async () => {
		const { userId, source } = setUp()
		await source.createCollection('Board kit', { ownerId: 'file-a' })
		await source.createCollection('Team kit')

		const reloaded = createCollectionsSource(userId)
		cleanups.push(() => reloaded.dispose())
		await vi.waitFor(() =>
			expect(reloaded.getCollections().map((c) => c.name)).toEqual([
				'Wireframes',
				'Icons',
				'Team kit',
			])
		)
	})
})

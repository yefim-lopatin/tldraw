import { type CollectionPack, InMemoryCollectionSource } from '@tldraw/collections'
import { describe, expect, it } from 'vitest'
import {
	addStarterPack,
	canAddStarterPack,
	getStarterPackId,
	isStarterPackAdded,
	STARTER_PACKS,
} from './starterPacks'

const pack: CollectionPack = { id: 'doodles', name: 'Doodles', version: 2, items: [] }

const owners = [
	{ id: 'acme', name: 'Acme' },
	{ id: 'home', name: 'Home' },
]

describe('starter pack data', () => {
	it('gives every pack a unique id', () => {
		const ids = STARTER_PACKS.map((p) => p.id)
		expect(new Set(ids).size).toBe(ids.length)
	})

	it.each(STARTER_PACKS.map((p) => [p.id, p] as const))(
		'%s has items, each with a thumbnail',
		(_, p) => {
			expect(p.items.length).toBeGreaterThan(0)
			expect(new Set(p.items.map((item) => item.id)).size).toBe(p.items.length)
			for (const item of p.items) {
				expect(item.thumbnail, item.id).toEqual(expect.stringMatching(/^data:image\//))
			}
		}
	)
})

describe('starter packs in a source without owners', () => {
	it('copies the pack as a new collection', async () => {
		const source = new InMemoryCollectionSource()
		const copy = await addStarterPack(source, pack)
		expect(copy).toMatchObject({ name: 'Doodles', meta: { packId: 'doodles', packVersion: 2 } })
		expect(copy.ownerId).toBeUndefined()
		expect(getStarterPackId(copy)).toBe('doodles')
	})

	it('names no pack for a collection made any other way', async () => {
		const source = new InMemoryCollectionSource()
		expect(getStarterPackId(await source.createCollection('Kit'))).toBeUndefined()
	})

	it('counts a pack as added while the source holds a copy of it', async () => {
		const source = new InMemoryCollectionSource()
		expect(isStarterPackAdded(source, 'doodles')).toBe(false)
		const copy = await addStarterPack(source, pack)
		expect(isStarterPackAdded(source, 'doodles')).toBe(true)
		expect(isStarterPackAdded(source, 'wireframing')).toBe(false)
		await source.deleteCollection(copy.id)
		expect(isStarterPackAdded(source, 'doodles')).toBe(false)
	})

	it("can't add a pack when the source refuses new collections", () => {
		expect(canAddStarterPack(new InMemoryCollectionSource())).toBe(true)
		expect(canAddStarterPack(new InMemoryCollectionSource({ can: () => false }))).toBe(false)
	})
})

describe('starter packs in a source with owners', () => {
	it('copies the pack into the default owner', async () => {
		const source = new InMemoryCollectionSource({ owners, defaultOwnerId: 'home' })
		const copy = await addStarterPack(source, pack)
		expect(copy).toMatchObject({ ownerId: 'home', meta: { packId: 'doodles', packVersion: 2 } })
	})

	it("doesn't count a copy that has moved to another owner", async () => {
		const source = new InMemoryCollectionSource({ owners, defaultOwnerId: 'home' })
		const copy = await addStarterPack(source, pack)
		expect(isStarterPackAdded(source, 'doodles')).toBe(true)
		await source.moveCollection(copy.id, 'acme')
		expect(isStarterPackAdded(source, 'doodles')).toBe(false)
	})

	it('asks whether the default owner may have new collections', () => {
		const source = new InMemoryCollectionSource({
			owners,
			defaultOwnerId: 'home',
			can: (_, target) => typeof target !== 'object' || target.ownerId !== 'home',
		})
		expect(canAddStarterPack(source)).toBe(false)
	})
})

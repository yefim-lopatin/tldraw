import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import type { TldrawApp } from '../../app/TldrawApp'
import { TldrawAppCollectionsSource } from './collectionsSource'

let lastUserId = 0
const newUserId = () => `user-${++lastUserId}`

// The source reads only these members off the app, so a stub stands in for a full TldrawApp. Each
// user has their own saved collections, so a new user starts from nothing saved.
function createSource(userId = newUserId(), workspaceIds = ['home', 'acme']) {
	const names: Record<string, string> = { home: 'Home', acme: 'Acme' }
	const app = {
		userId,
		getHomeWorkspaceId: () => 'home',
		getWorkspaceMemberships: () =>
			workspaceIds.map((groupId) => ({ groupId, group: { name: names[groupId] } })),
		msg: (message: { defaultMessage: string }) => message.defaultMessage,
	}
	return new TldrawAppCollectionsSource(app as unknown as TldrawApp)
}

const names = (source: TldrawAppCollectionsSource) =>
	source.getCollections().map((collection) => collection.name)

describe('TldrawAppCollectionsSource', () => {
	it("lists the user's workspaces as owners, home first, and creates new collections there", async () => {
		const source = createSource()
		expect(source.getCollectionOwners()).toEqual([
			{ id: 'home', name: 'Private to you' },
			{ id: 'acme', name: 'Acme' },
		])
		expect(source.getDefaultOwnerId()).toBe('home')
		expect(source.getCollections().map((c) => c.ownerId)).toEqual(['home', 'home'])
		const collection = await source.createCollection('Team kit')
		expect(collection.ownerId).toBe('home')
	})

	it('keeps each collection with its owner across a reload', async () => {
		const userId = newUserId()
		const source = createSource(userId)
		await source.createCollection('Home kit')
		const teamKit = await source.createCollection('Team kit')
		await source.moveCollection(teamKit.id, 'acme')
		source.dispose()

		const reloaded = createSource(userId)
		await vi.waitFor(() =>
			expect(names(reloaded)).toEqual(['Wireframes', 'Icons', 'Home kit', 'Team kit'])
		)
		expect(reloaded.getCollections().find((c) => c.name === 'Team kit')?.ownerId).toBe('acme')
	})

	it("hides a workspace's collections once the user is no longer in it", async () => {
		const userId = newUserId()
		const source = createSource(userId)
		await source.createCollection('Home kit')
		await source.createCollection('Team kit', { ownerId: 'acme' })
		source.dispose()

		const reloaded = createSource(userId, ['home'])
		await vi.waitFor(() => expect(names(reloaded)).toEqual(['Wireframes', 'Icons', 'Home kit']))
	})
})

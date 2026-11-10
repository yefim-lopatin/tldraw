import type { MutatorResultErrorDetails } from '@rocicorp/zero'
import {
	CollectionItemRecordType,
	CollectionNotFoundError,
	CollectionPermissionError,
	CollectionRecordType,
	getThumbnailForColorMode,
	mapThumbnail,
	type CollectionSource,
	type TLCollection,
	type TLCollectionAction,
	type TLCollectionId,
	type TLCollectionItem,
	type TLCollectionItemContent,
	type TLCollectionItemId,
	type TLCollectionOwner,
	type TLCollectionTarget,
	type TLCollectionThumbnail,
	type TLNewCollectionItem,
	type TLNewCollectionOptions,
} from '@tldraw/collections'
import { can, type TlaCollection, type TlaCollectionItemThumbnail } from '@tldraw/dotcom-shared'
import { structuredClone } from '@tldraw/utils'
import { atom, computed, defineMessages, fetch, react, uniqueId } from 'tldraw'
import type { TldrawApp } from '../../app/TldrawApp'

const messages = defineMessages({
	privateToYou: { defaultMessage: 'Private to you' },
})

type MutationResult = { type: 'success' } | MutatorResultErrorDetails

interface StoredItem {
	createdAt: number
	thumbnail: TlaCollectionItemThumbnail | null
}

/** An item being added, under the id its row will have: listed until the row arrives through Zero. */
interface PendingItem {
	item: TLCollectionItem
	content: TLCollectionItemContent
	/** Whether the row arrived: false when adding failed. */
	arrived: Promise<boolean>
}

// A row's id is the record id without its type prefix.
const rowId = (id: TLCollectionId | TLCollectionItemId) => id.slice(id.indexOf(':') + 1)

const toCollection = (row: TlaCollection): TLCollection =>
	CollectionRecordType.create({
		id: CollectionRecordType.createId(row.id),
		name: row.name,
		ownerId: row.owningGroupId,
		meta: row.meta ?? {},
	})

const revokeThumbnail = (thumbnail: TLCollectionThumbnail) =>
	mapThumbnail(thumbnail, (url) => URL.revokeObjectURL(url))

/**
 * Workspace collections, kept in tldraw.com's database and synced through Zero: those of every
 * workspace the user is a member of, the home workspace's being private to them. A board's own
 * collections are kept in its document instead (see editorCollections).
 *
 * Collections and item rows come from the app's collections query and change through mutators.
 * An item's content is stored by the sync worker, which also adds items and copies collections,
 * and is fetched with the user's token. Its thumbnails are public uploads whose URLs are on its
 * row, so they load as ordinary images.
 *
 * A new collection is listed as soon as Zero has applied it locally, and a new item as soon as it's
 * asked for, with the thumbnails it was given, while the worker stores it. A collection the server
 * rejects disappears and the app shows its mutation error; an item the worker can't store
 * disappears and `addItem` rejects.
 */
export class TldrawAppCollectionsSource implements CollectionSource {
	readonly id = 'dotcom-workspaces'

	private readonly pendingItems = atom<PendingItem[]>('pending collection items', [])
	// Object URLs of thumbnails added here, by item row id, listed instead of the uploaded copies so
	// a tile doesn't blank while those load.
	private readonly localThumbnails = atom<ReadonlyMap<string, TLCollectionThumbnail>>(
		'local collection item thumbnails',
		new Map()
	)
	// Collections created here that the server hasn't confirmed yet, by row id. The worker can't add
	// items to them or copy them until it has.
	private readonly unconfirmedCollections = new Map<string, Promise<boolean>>()

	private readonly owners$ = computed('collection owners', (): TLCollectionOwner[] => {
		const homeId = this.app.getHomeWorkspaceId()
		const memberships = this.app.getWorkspaceMemberships()
		// The collections UI names the home workspace for who sees it, not by its name.
		return [
			{ id: homeId, name: this.app.msg(messages.privateToYou) },
			...memberships.flatMap((m) =>
				m.groupId !== homeId && m.group ? [{ id: m.groupId, name: m.group.name }] : []
			),
		]
	})

	private readonly collections$ = computed('workspace collections', () =>
		this.app.getCollectionRows().map(toCollection)
	)

	private readonly items$ = computed('workspace collection items', () => {
		const localThumbnails = this.localThumbnails.get()
		const byCollection = new Map<string, TLCollectionItem[]>()
		const itemRowIds = new Set<string>()
		for (const row of this.app.getCollectionRows()) {
			byCollection.set(
				row.id,
				row.items.map((item) => {
					itemRowIds.add(item.id)
					const thumbnail = localThumbnails.get(item.id) ?? item.thumbnail
					return CollectionItemRecordType.create({
						id: CollectionItemRecordType.createId(item.id),
						collectionId: CollectionRecordType.createId(row.id),
						...(item.name ? { name: item.name } : {}),
						...(thumbnail ? { thumbnail } : {}),
						createdAt: item.createdAt,
					})
				})
			)
		}
		for (const { item } of this.pendingItems.get()) {
			if (itemRowIds.has(rowId(item.id))) continue
			const collectionRowId = rowId(item.collectionId)
			byCollection.set(collectionRowId, [...(byCollection.get(collectionRowId) ?? []), item])
		}
		return byCollection
	})

	constructor(
		private readonly app: TldrawApp,
		private readonly getToken: () => Promise<string | undefined>
	) {}

	getCollections() {
		return this.collections$.get()
	}

	getItems(collectionId: TLCollectionId) {
		return this.items$.get().get(rowId(collectionId)) ?? []
	}

	async getItemContent(itemId: TLCollectionItemId): Promise<TLCollectionItemContent> {
		const pending = this.findPendingItem(itemId)
		if (pending) return structuredClone(pending.content)
		const response = await this.request(`/api/app/collection-items/${rowId(itemId)}/content`)
		if (response.status === 404) throw new CollectionNotFoundError(itemId)
		if (!response.ok) throw new Error(`Couldn't load the item: ${response.status}`)
		return (await response.json()) as TLCollectionItemContent
	}

	can(_action: TLCollectionAction, target?: TLCollectionTarget) {
		// Every member of a workspace can manage its collections, so the action doesn't matter.
		const ownerId = this.getTargetOwnerId(target)
		return ownerId !== undefined && this.canManageIn(ownerId)
	}

	getCollectionOwners() {
		return this.owners$.get()
	}

	getDefaultOwnerId() {
		return this.app.getHomeWorkspaceId()
	}

	async createCollection(name: string, options: TLNewCollectionOptions = {}) {
		const ownerId = options.ownerId ?? this.getDefaultOwnerId()
		if (!this.canManageIn(ownerId)) throw new CollectionPermissionError('createCollection')
		const id = uniqueId()
		const meta = options.meta ?? {}
		const mutation = this.app.z.mutate.collection.create({ id, name, owningGroupId: ownerId, meta })
		await this.check(mutation.client)
		this.unconfirmedCollections.set(
			id,
			(mutation.server as Promise<MutationResult>).then((result) => {
				this.unconfirmedCollections.delete(id)
				if (result.type === 'success') return true
				this.app.showMutationRejectionToast(result.error)
				return false
			})
		)
		return CollectionRecordType.create({
			id: CollectionRecordType.createId(id),
			name: name.trim(),
			ownerId,
			meta,
		})
	}

	async renameCollection(collectionId: TLCollectionId, name: string) {
		await this.check(this.app.z.mutate.collection.rename({ id: rowId(collectionId), name }).server)
	}

	async deleteCollection(collectionId: TLCollectionId) {
		await this.check(this.app.z.mutate.collection.delete({ id: rowId(collectionId) }).server)
	}

	async moveCollection(collectionId: TLCollectionId, ownerId: string) {
		await this.check(
			this.app.z.mutate.collection.move({ id: rowId(collectionId), owningGroupId: ownerId }).server
		)
	}

	async copyCollection(collectionId: TLCollectionId, ownerId: string): Promise<TLCollection> {
		const collection = this.findRow(collectionId)
		if (!collection) throw new CollectionNotFoundError(collectionId)
		await this.whenConfirmed(collectionId)
		const response = await this.request(`/api/app/collections/${rowId(collectionId)}/copy`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ owningGroupId: ownerId }),
		})
		if (!response.ok) throw new Error(`Couldn't copy the collection: ${response.status}`)
		const { id } = (await response.json()) as { id: string }
		return toCollection({ ...collection, id, owningGroupId: ownerId })
	}

	async addItem(collectionId: TLCollectionId, newItem: TLNewCollectionItem) {
		if (!this.can('addItem', collectionId)) {
			throw new CollectionPermissionError('addItem', collectionId)
		}
		const thumbnail =
			newItem.thumbnail && mapThumbnail(newItem.thumbnail, (blob) => URL.createObjectURL(blob))
		const name = newItem.name ? { name: newItem.name } : {}
		const id = uniqueId()
		const itemId = CollectionItemRecordType.createId(id)
		let arrive: (arrived: boolean) => void = () => {}
		const pending: PendingItem = {
			item: CollectionItemRecordType.create({
				id: itemId,
				collectionId,
				...name,
				...(thumbnail ? { thumbnail } : {}),
				createdAt: Date.now(),
			}),
			content: newItem.content,
			arrived: new Promise((resolve) => {
				arrive = resolve
			}),
		}
		this.pendingItems.update((all) => [...all, pending])

		let stored: StoredItem
		try {
			await this.whenConfirmed(collectionId)
			stored = await this.storeItem(id, collectionId, newItem)
		} catch (error) {
			this.pendingItems.update((all) => all.filter((p) => p.item.id !== itemId))
			if (thumbnail) revokeThumbnail(thumbnail)
			arrive(false)
			throw error
		}

		const listedThumbnail = thumbnail ?? stored.thumbnail
		const item = CollectionItemRecordType.create({
			id: itemId,
			collectionId,
			...name,
			...(listedThumbnail ? { thumbnail: listedThumbnail } : {}),
			createdAt: stored.createdAt,
		})
		if (thumbnail) {
			this.localThumbnails.update((all) => new Map(all).set(id, thumbnail))
		}
		this.pendingItems.update((all) => all.map((p) => (p.item.id === itemId ? { ...p, item } : p)))
		this.whenItemRowArrives(id).then(() => {
			this.pendingItems.update((all) => all.filter((p) => p.item.id !== itemId))
			arrive(true)
		})
		return item
	}

	async renameItem(itemId: TLCollectionItemId, name: string) {
		const id = await this.getItemRowId(itemId)
		await this.check(this.app.z.mutate.collection_item.rename({ id, name }).server)
	}

	async deleteItem(itemId: TLCollectionItemId) {
		const id = await this.getItemRowId(itemId)
		await this.check(this.app.z.mutate.collection_item.delete({ id }).server)
		const thumbnail = this.localThumbnails.get().get(id)
		if (!thumbnail) return
		revokeThumbnail(thumbnail)
		this.localThumbnails.update((all) => {
			const rest = new Map(all)
			rest.delete(id)
			return rest
		})
	}

	async moveItem(itemId: TLCollectionItemId, toCollectionId: TLCollectionId) {
		const id = await this.getItemRowId(itemId)
		await this.check(
			this.app.z.mutate.collection_item.move({ id, collectionId: rowId(toCollectionId) }).server
		)
	}

	/** Releases the thumbnail URLs this source made for items added here. */
	dispose() {
		for (const thumbnail of this.localThumbnails.get().values()) revokeThumbnail(thumbnail)
		for (const { item } of this.pendingItems.get()) {
			if (item.thumbnail) revokeThumbnail(item.thumbnail)
		}
		this.localThumbnails.set(new Map())
		this.pendingItems.set([])
	}

	private async storeItem(
		id: string,
		collectionId: TLCollectionId,
		newItem: TLNewCollectionItem
	): Promise<StoredItem> {
		const form = new FormData()
		form.set('id', id)
		form.set('content', JSON.stringify(newItem.content))
		if (newItem.thumbnail) {
			form.set('thumbnail', getThumbnailForColorMode(newItem.thumbnail, 'light'))
			if (!(newItem.thumbnail instanceof Blob)) form.set('darkThumbnail', newItem.thumbnail.dark)
		}
		if (newItem.name) form.set('name', newItem.name)
		const response = await this.request(`/api/app/collections/${rowId(collectionId)}/items`, {
			method: 'POST',
			body: form,
		})
		if (!response.ok) throw new Error(`Couldn't add the item: ${response.status}`)
		return (await response.json()) as StoredItem
	}

	private findPendingItem(itemId: TLCollectionItemId) {
		return this.pendingItems.get().find((p) => p.item.id === itemId)
	}

	// The mutators need the item's row in the local store, which a pending item doesn't have yet.
	private async getItemRowId(itemId: TLCollectionItemId) {
		const pending = this.findPendingItem(itemId)
		if (pending && !(await pending.arrived)) throw new CollectionNotFoundError(itemId)
		return rowId(itemId)
	}

	private hasItemRow(id: string) {
		return this.app.getCollectionRows().some((row) => row.items.some((item) => item.id === id))
	}

	private whenItemRowArrives(id: string) {
		if (this.hasItemRow(id)) return Promise.resolve()
		return new Promise<void>((resolve) => {
			const stop = react('collection item row arrives', () => {
				if (!this.hasItemRow(id)) return
				stop()
				resolve()
			})
		})
	}

	private async whenConfirmed(collectionId: TLCollectionId) {
		const confirmed = await this.unconfirmedCollections.get(rowId(collectionId))
		if (confirmed === false) throw new CollectionNotFoundError(collectionId)
	}

	private getTargetOwnerId(target?: TLCollectionTarget) {
		if (target === undefined) return this.getDefaultOwnerId()
		if (typeof target === 'object') return target.ownerId
		return this.findRow(target)?.owningGroupId
	}

	private findRow(collectionId: TLCollectionId) {
		const id = rowId(collectionId)
		return this.app.getCollectionRows().find((row) => row.id === id)
	}

	private canManageIn(workspaceId: string) {
		return can(this.app.getWorkspaceMembership(workspaceId)?.role, 'manageCollections')
	}

	// Zero's mutation promises resolve with an error result rather than rejecting.
	private async check(result: Promise<MutationResult>) {
		const outcome = await result
		if (outcome.type === 'error') {
			throw new Error('The change was rejected', { cause: outcome.error })
		}
	}

	private async request(path: string, init: RequestInit = {}) {
		const token = await this.getToken()
		const headers = new Headers(init.headers)
		if (token) headers.set('Authorization', `Bearer ${token}`)
		return fetch(path, { ...init, headers })
	}
}

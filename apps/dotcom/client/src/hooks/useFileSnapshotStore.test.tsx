import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
	CollectionRecordType,
	EmbedShapeUtil,
	TLStoreSnapshot,
	TLStoreWithStatus,
	createTLStore,
	defaultBindingUtils,
	defaultShapeUtils,
} from 'tldraw'
import { describe, expect, it } from 'vitest'
import { useFileSnapshotStore } from './useFileSnapshotStore'

const embedShapeUtils = [EmbedShapeUtil.configure({ embedConfig: {} })]

function renderStore(snapshot: TLStoreSnapshot) {
	let result: TLStoreWithStatus | undefined
	function Harness() {
		result = useFileSnapshotStore(snapshot, embedShapeUtils)
		return null
	}
	const root = createRoot(document.createElement('div'))
	act(() => root.render(<Harness />))
	act(() => root.unmount())
	return result!
}

function snapshotWithCollection() {
	const store = createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils })
	const snapshot = store.getStoreSnapshot()
	const collection = CollectionRecordType.create({ name: 'Wireframes' })
	return {
		collection,
		snapshot: { ...snapshot, store: { ...snapshot.store, [collection.id]: collection } },
	}
}

describe('useFileSnapshotStore', () => {
	it('loads a snapshot that holds board collections', () => {
		const { collection, snapshot } = snapshotWithCollection()
		const result = renderStore(snapshot)
		expect(result.status).toBe('not-synced')
		expect(result.store?.get(collection.id as any)).toEqual(collection)
	})

	it('turns a snapshot it cannot load into an error status', () => {
		const { snapshot } = snapshotWithCollection()
		const result = renderStore({ ...snapshot, schema: { schemaVersion: 99 } as any })
		expect(result.status).toBe('error')
	})
})

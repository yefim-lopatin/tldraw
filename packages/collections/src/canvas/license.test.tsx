import { collectionSchemaRecords } from '@tldraw/tlschema'
import { act, useMemo } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
	createShapeId,
	createTLSchema,
	createTLStore,
	defaultBindingUtils,
	defaultShapeUtils,
	Editor,
	LicenseManager,
	Tldraw,
	useEditor,
} from 'tldraw'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { BoardCollectionSource } from '../lib/BoardCollectionSource'
import { CURRENT_ITEM_CONTENT_FORMAT_VERSION } from '../lib/schema'
import { CollectionsPanel } from './collections-panel'
import { CollectionsPanelButton } from './collections-panel-button'
import { collectionsPanelOpen } from './state'

beforeAll(() => {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver
	globalThis.FontFace ??= class {
		load() {
			return Promise.resolve(this)
		}
	} as unknown as typeof FontFace
	Object.defineProperty(document, 'fonts', {
		configurable: true,
		value: { add() {}, delete() {}, forEach() {}, [Symbol.iterator]: () => [][Symbol.iterator]() },
	})
	window.matchMedia ??= (query: string) =>
		({
			matches: false,
			media: query,
			addEventListener() {},
			removeEventListener() {},
			addListener() {},
			removeListener() {},
		}) as unknown as MediaQueryList
})

let root: Root | null = null
let container: HTMLDivElement | null = null
let editors: Editor[] = []

afterEach(() => {
	act(() => root?.unmount())
	container?.remove()
	root = null
	container = null
	for (const editor of editors) editor.dispose()
	editors = []
})

async function settled(licenseManager: LicenseManager) {
	await vi.waitFor(() => expect(licenseManager.state.get()).not.toBe('pending'))
}

function setCollectionsLicensed(licenseManager: LicenseManager, licensed: boolean) {
	licenseManager.featureFlags.set({ ...licenseManager.featureFlags.get(), collections: licensed })
}

async function renderWithCollections() {
	container = document.createElement('div')
	document.body.appendChild(container)
	let mounted: Editor | undefined
	const store = createTLStore({ schema: createTLSchema({ records: collectionSchemaRecords }) })
	const Collections = () => {
		const editor = useEditor()
		const source = useMemo(() => new BoardCollectionSource(editor), [editor])
		return (
			<>
				<CollectionsPanel source={source} />
				<div className="collections-button-slot">
					<CollectionsPanelButton />
				</div>
			</>
		)
	}
	root = createRoot(container)
	act(() => {
		root!.render(
			<div style={{ width: 800, height: 600 }}>
				<Tldraw
					store={store}
					onMount={(editor) => {
						mounted = editor
					}}
					components={{ InFrontOfTheCanvas: Collections }}
				/>
			</div>
		)
	})
	await vi.waitFor(() => expect(mounted).toBeDefined())
	const editor = mounted!
	const licenseManager = editor.licenseManager!
	await settled(licenseManager)
	return { editor, licenseManager, container }
}

describe('collections UI', () => {
	it('renders when collections are licensed and nothing when they are not', async () => {
		const { editor, licenseManager, container } = await renderWithCollections()
		const panel = () => container.querySelector('.tlui-collections-panel')
		const button = () => container.querySelector('.collections-button-slot button')
		collectionsPanelOpen.set(editor, true)

		await vi.waitFor(() => expect(panel()).not.toBeNull())
		expect(button()).not.toBeNull()

		setCollectionsLicensed(licenseManager, false)
		await vi.waitFor(() => expect(panel()).toBeNull())
		expect(button()).toBeNull()

		setCollectionsLicensed(licenseManager, true)
		await vi.waitFor(() => expect(panel()).not.toBeNull())
		expect(button()).not.toBeNull()
	})
})

describe('collection records without the collections license', () => {
	function makeUnlicensedEditor() {
		const editor = new Editor({
			store: createTLStore({ schema: createTLSchema({ records: collectionSchemaRecords }) }),
			shapeUtils: defaultShapeUtils,
			bindingUtils: defaultBindingUtils,
			tools: [],
			getContainer: () => document.body,
		})
		editors.push(editor)
		return editor
	}

	it('still load, save and place', async () => {
		const editor = makeUnlicensedEditor()
		const licenseManager = new LicenseManager(undefined)
		await settled(licenseManager)
		setCollectionsLicensed(licenseManager, false)
		editor.licenseManager = licenseManager
		expect(licenseManager.isFeatureEnabled('collections')).toBe(false)

		const source = new BoardCollectionSource(editor)
		const shapeId = createShapeId()
		editor.createShape({ id: shapeId, type: 'geo', x: 0, y: 0 })
		const collection = await source.createCollection('Kit')
		const item = await source.addItem(collection.id, {
			content: {
				formatVersion: CURRENT_ITEM_CONTENT_FORMAT_VERSION,
				content: editor.getContentFromCurrentPage([shapeId])!,
			},
		})

		const reloaded = makeUnlicensedEditor()
		reloaded.loadSnapshot(editor.getSnapshot())
		const reloadedSource = new BoardCollectionSource(reloaded)
		expect(reloadedSource.getCollections()).toEqual([collection])
		expect(reloadedSource.getItems(collection.id)).toEqual([item])
		const { content } = await reloadedSource.getItemContent(item.id)
		reloaded.putContentOntoCurrentPage(content)
		expect(reloaded.getCurrentPageShapes().filter((s) => s.type === 'geo')).toHaveLength(2)
		licenseManager.dispose()
	})
})

import { useLicenseFeatureFlag, useMaybeLicenseManager } from 'tldraw'

/**
 * Whether collections are licensed for this editor. Enabled in development; in production it
 * requires a tldraw license that includes the collections feature. Reactive: re-reads when license
 * validation resolves, and returns `false` while validation is pending, so gated UI stays hidden
 * until the license is confirmed. Works outside `<Tldraw />` too: UI mounted via `EditorProvider`
 * resolves the license through the editor, and with no editor at all this is `false`.
 *
 * The built-in collections components (`CollectionsPanel`, `CollectionsPanelButton`, the button
 * `CollectionsQuickActions` adds, and `AddToCollectionMenuItem`) gate on this. Use it to gate any
 * custom collections UI the same way. Collection records and sources are not gated: a document that
 * contains collections loads, migrates and saves without the license.
 * @public
 */
export function useCollectionsEnabled(): boolean {
	return useLicenseFeatureFlag(useMaybeLicenseManager(), 'collections')
}

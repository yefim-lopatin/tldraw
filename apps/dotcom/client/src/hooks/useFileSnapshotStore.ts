import { useMemo } from 'react'
import {
	TLAnyShapeUtilConstructor,
	TLStoreSnapshot,
	TLStoreWithStatus,
	createTLStore,
	defaultBindingUtils,
	defaultShapeUtils,
} from 'tldraw'
import { fileSchemaRecords } from '../utils/fileSchemaRecords'

/**
 * A store over a snapshot of a file, with the file's record types registered. Pass the same
 * `shapeUtils` as the `Tldraw` the store is given to. A snapshot the store can't load becomes an
 * error status, which `Tldraw` hands to its error fallback.
 */
export function useFileSnapshotStore(
	snapshot: TLStoreSnapshot,
	shapeUtils: readonly TLAnyShapeUtilConstructor[]
): TLStoreWithStatus {
	return useMemo(() => {
		try {
			const store = createTLStore({
				snapshot,
				records: fileSchemaRecords,
				shapeUtils: [
					...defaultShapeUtils.filter((util) => !shapeUtils.some((s) => s.type === util.type)),
					...shapeUtils,
				],
				bindingUtils: defaultBindingUtils,
			})
			return { status: 'not-synced', store }
		} catch (error) {
			return { status: 'error', error: error instanceof Error ? error : new Error(String(error)) }
		}
	}, [snapshot, shapeUtils])
}

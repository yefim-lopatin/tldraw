import type { RecordProps, TLShape } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'

export const DICE_SIDES = [2, 4, 6, 8, 10, 12, 20, 100] as const
export type DiceSides = (typeof DICE_SIDES)[number]
export interface Roll {
	id: string
	sides: DiceSides
	results: number[]
	hunger: number
	difficulty: number
	username: string
	time: number
}

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		'dice-roll': Omit<Roll, 'id'> & { w: number; h: number }
	}
}

export type DiceRollShape = TLShape<'dice-roll'>
export const diceRollProps: RecordProps<DiceRollShape> = {
	w: T.positiveNumber,
	h: T.positiveNumber,
	sides: T.literalEnum(...DICE_SIDES),
	results: T.arrayOf(T.integer),
	hunger: T.integer,
	difficulty: T.integer,
	username: T.string,
	time: T.number,
}

export function isRoomId(value: unknown): value is string {
	return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value)
}

export function isRoll(value: unknown): value is Roll {
	if (!value || typeof value !== 'object') return false
	const r = value as Roll
	return (
		typeof r.id === 'string' &&
		r.id.length > 0 &&
		r.id.length <= 100 &&
		typeof r.username === 'string' &&
		r.username.length <= 100 &&
		DICE_SIDES.includes(r.sides) &&
		Array.isArray(r.results) &&
		r.results.length >= 1 &&
		r.results.length <= 20 &&
		r.results.every((n) => Number.isInteger(n) && n >= 1 && n <= r.sides) &&
		Number.isInteger(r.hunger) &&
		r.hunger >= 0 &&
		r.hunger <= Math.min(10, r.results.length) &&
		(r.sides === 10 || r.hunger === 0) &&
		Number.isInteger(r.difficulty) &&
		(r.difficulty === -1 || (r.sides === 10 && r.difficulty >= 0 && r.difficulty <= 40)) &&
		Number.isFinite(r.time)
	)
}

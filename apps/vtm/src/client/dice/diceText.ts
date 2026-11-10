import {
	createShapeId,
	toRichText,
	type Editor,
	type TLPageId,
	type TLShapeId,
	type TLShapePartial,
	type TLTextShape,
} from 'tldraw'
import { DICE_SIDES, type DiceSides, type Roll } from '../../shared/dice'
import { diceFontFace } from '../../shared/diceFont'
import { getDieDimensions } from './diceSvg'
import { getV5Result } from './v5Dice'

export function getDieCharacter(sides: DiceSides, result: number, v5 = false, hunger = false) {
	if (!Number.isInteger(result) || result < 1 || result > sides)
		throw new Error('Недопустимый результат броска')
	if (v5 && sides === 10) {
		const symbol =
			hunger && result === 1 ? 6 : (hunger ? 3 : 0) + (result === 10 ? 2 : result >= 6 ? 1 : 0)
		return String.fromCodePoint(0xe400 + symbol)
	}
	return String.fromCodePoint(0xe000 + DICE_SIDES.indexOf(sides) * 128 + result - 1)
}

export function diceTextRecords(
	roll: Roll,
	point: { x: number; y: number },
	parentId?: TLShapeId | TLPageId
) {
	const columns = Math.min(roll.results.length, 5)
	const rows = Math.ceil(roll.results.length / columns)
	const width = getDieDimensions(roll.sides).width
	const left = point.x - (columns * width + (columns - 1) * 12) / 2
	const top = point.y - (rows * 84) / 2
	const shapes: TLShapePartial<TLTextShape>[] = []
	for (let row = 0; row < rows; row++) {
		const start = row * columns,
			end = Math.min(start + columns, roll.results.length)
		for (let index = start; index < end; ) {
			const red = index < roll.hunger
			const runEnd = red ? Math.min(end, roll.hunger) : end
			shapes.push({
				id: createShapeId(`${roll.id}-text-${index}`),
				type: 'text',
				parentId,
				x: left + (index - start) * (width + 12),
				y: top + row * 84,
				props: {
					font: 'dice',
					size: 'm',
					scale: 64 / 24,
					color: red ? 'red' : 'black',
					textAlign: 'start',
					autoSize: true,
					w: (runEnd - index) * (width + 12),
					richText: toRichText(
						roll.results
							.slice(index, runEnd)
							.map((n) => getDieCharacter(roll.sides, n, roll.difficulty >= 0, red))
							.join(' ')
					),
				},
				meta: { diceRollId: roll.id },
			})
			index = runEnd
		}
	}
	if (roll.difficulty >= 0)
		shapes.push({
			id: createShapeId(`${roll.id}-result`),
			type: 'text',
			parentId,
			x: left,
			y: top + rows * 84 + 8,
			props: {
				font: 'sans',
				size: 'm',
				scale: 20 / 24,
				color: 'black',
				textAlign: 'start',
				autoSize: true,
				w: 320,
				richText: toRichText(getV5Result(roll.results, roll.hunger, roll.difficulty)),
			},
			meta: { diceRollId: roll.id },
		})
	return shapes
}

export function addDiceText(
	editor: Editor,
	roll: Roll,
	point: { x: number; y: number },
	parentId?: TLShapeId | TLPageId
) {
	const shapes = diceTextRecords(roll, point, parentId)
	const ids = shapes.map((s) => s.id!)
	const groupId = createShapeId(`${roll.id}-group`)
	if (editor.getShape(groupId) || ids.some((id) => editor.getShape(id))) return
	editor.run(() => {
		editor.createShapes(shapes)
		editor.groupShapes(ids, { groupId, select: false })
	})
}

export function migrateDiceCards(editor: Editor) {
	const cards = editor.store
		.allRecords()
		.filter((r) => r.typeName === 'shape' && r.type === 'dice-roll')
	for (const card of cards) {
		if (card.typeName !== 'shape' || card.type !== 'dice-roll') continue
		const { w, h, ...roll } = card.props
		const id = card.id.slice('shape:'.length)
		editor.run(
			() => {
				addDiceText(
					editor,
					{ id, ...roll },
					{ x: card.x + w / 2, y: card.y + h / 2 },
					card.parentId
				)
				const groupId = createShapeId(`${id}-group`)
				if (editor.getShape(groupId))
					editor.updateShape({
						id: groupId,
						type: 'group',
						rotation: card.rotation,
						opacity: card.opacity,
					})
				editor.deleteShapes([card.id])
			},
			{ history: 'ignore' }
		)
	}
}

export function loadDiceFont(editor: Editor) {
	return editor.fonts.ensureFontIsLoaded(diceFontFace)
}

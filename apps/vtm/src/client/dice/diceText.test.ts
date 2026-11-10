import { DefaultFontStyle } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import { DICE_SIDES, type Roll } from '../../shared/dice'
import { diceTextRecords, getDieCharacter } from './diceText'

describe('Кубики обычным текстом', () => {
	it('сохраняет все 162 символа шрифта Excalidraw', () => {
		const glyphs = DICE_SIDES.flatMap((sides) =>
			Array.from({ length: sides }, (_, i) => getDieCharacter(sides, i + 1))
		)
		expect(glyphs).toHaveLength(162)
		expect(new Set(glyphs).size).toBe(162)
	})
	it('сохраняет специальные символы успеха, триумфа и единицы Голода', () => {
		expect([
			getDieCharacter(10, 1, true, true),
			getDieCharacter(10, 6, true),
			getDieCharacter(10, 10, true),
		]).toEqual([
			String.fromCodePoint(0xe406),
			String.fromCodePoint(0xe401),
			String.fromCodePoint(0xe402),
		])
	})
	it('создаёт текст со шрифтом Dice и красным Голодом, без карточки и изображений', () => {
		const roll: Roll = {
			id: 'test-roll',
			sides: 10,
			results: [1, 10, 6, 3, 9, 5],
			hunger: 2,
			difficulty: 3,
			username: 'Игрок',
			time: 1,
		}
		const shapes = diceTextRecords(roll, { x: 500, y: 300 })
		expect(shapes).toHaveLength(4)
		expect(shapes.every((shape) => shape.type === 'text')).toBe(true)
		expect(shapes.slice(0, 3).map((shape) => shape.props?.font)).toEqual(['dice', 'dice', 'dice'])
		expect(shapes.slice(0, 3).map((shape) => shape.props?.color)).toEqual(['red', 'black', 'black'])
		expect(shapes[3].props?.font).toBe('sans')
		expect(DefaultFontStyle.validate('dice')).toBe('dice')
	})
})

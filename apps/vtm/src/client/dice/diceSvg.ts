import { DICE_SIDES, type DiceSides } from '../../shared/dice'
import { BOARD_DICE, drawBoardDie } from './BoardDice'
export { DICE_SIDES }
export type { DiceSides }

const DICE_SIZE = 64
const PERCENTILE_DICE_WIDTH = 116
const RESULT_TEXT_COLOR = '#000000'
const RESULT_TEXT_OUTLINE = '#ffffff'

export function getDieDimensions(sides: DiceSides) {
	return {
		width: sides === 100 ? PERCENTILE_DICE_WIDTH : DICE_SIZE,
		height: DICE_SIZE,
	}
}

const createValueSvg = (
	value: string | number,
	x: number,
	y: number,
	fontSize: number,
	textColor: string,
	backgroundColor: string
) =>
	`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${textColor}" stroke="${backgroundColor}" stroke-width="5" stroke-linejoin="round" style="paint-order: stroke">${value}</text>`

export function createDieSvg(
	sides: DiceSides,
	result: number,
	_accentColor: string,
	isDarkTheme: boolean
) {
	const paper = isDarkTheme ? '#252529' : '#ffffff'
	const ink = isDarkTheme ? '#e6e6eb' : '#363636'
	const { width, height } = getDieDimensions(sides)
	const value = (number: string | number, x: number, y: number, size = 17) =>
		createValueSvg(number, x, y, size, RESULT_TEXT_COLOR, RESULT_TEXT_OUTLINE)
	let shape: string
	if (sides === 2) {
		shape = `<g data-die-shape="coin"><circle cx="32" cy="32" r="28" fill="${paper}" stroke="${ink}" stroke-width="2"/>${value(result, 32, 33)}</g>`
	} else if (sides === 100) {
		const tens = result === 100 ? '00' : String(Math.floor(result / 10) * 10).padStart(2, '0')
		shape = `<g data-die-shape="percentile-pair"><g transform="scale(.9)">${drawBoardDie(10, ink, paper)}${value(tens, 32, 26)}</g><g transform="translate(58 0) scale(.9)">${drawBoardDie(10, ink, paper)}${value(result === 100 ? 0 : result % 10, 32, 26)}</g></g>`
	} else {
		const die = BOARD_DICE[sides]
		shape = drawBoardDie(sides, ink, paper) + value(result, die.x, die.y, sides === 6 ? 14 : 17)
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shape}</svg>`
}

import { DEFAULT_THEME, type TLThemes } from 'tldraw'
import { diceFontFace } from '../../shared/diceFont'

export const diceThemes: Partial<TLThemes> = {
	default: {
		...DEFAULT_THEME,
		id: 'default',
		fonts: {
			...DEFAULT_THEME.fonts,
			dice: { fontFamily: 'VtmDice', faces: [diceFontFace], icon: 'tool-text' },
		},
	},
}

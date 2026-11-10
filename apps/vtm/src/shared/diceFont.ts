import { DefaultFontStyle, type TLThemeFont } from '@tldraw/tlschema'

declare module '@tldraw/tlschema' {
	interface TLThemeFonts {
		dice: TLThemeFont
	}
}

export const diceFontFace = {
	family: 'VtmDice',
	src: { url: '/fonts/Dice-Regular.woff2', format: 'woff2' },
	weight: 'normal',
	style: 'normal',
}

// The server validates font names before a client's theme is available.
DefaultFontStyle.addValues('dice' as any)

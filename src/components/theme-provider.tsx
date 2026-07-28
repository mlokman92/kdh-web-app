import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

/**
 * App-wide theme provider (class-based dark mode for Tailwind v4).
 * Mounted once at the root of `App.tsx`.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      storageKey="kdh-one-asset-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

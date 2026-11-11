/**
 * Runs in <head> before the first paint (app/layout.tsx): inside the Starlog app's WebView (the user agent test of
 * lib/inApp.ts isStarlogApp) it sets <html data-app="android">, which shows `.app-only` and hides `.web-only`
 * (app/globals.css). A normal browser gets nothing. Server-safe: a plain string, no React.
 */
export const APP_MODE_SCRIPT = 'if(/\\bStarlogApp\\/\\d/.test(navigator.userAgent))document.documentElement.dataset.app="android"';

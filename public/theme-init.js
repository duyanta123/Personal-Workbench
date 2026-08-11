try {
  var storedTheme = localStorage.getItem('wb-theme')
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  if (storedTheme === 'dark' || ((!storedTheme || storedTheme === 'system') && prefersDark)) {
    document.documentElement.classList.add('dark')
  }
} catch {
  // Storage can be unavailable in hardened or private browsing contexts.
}

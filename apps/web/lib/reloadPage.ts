/** Loads the whole page again: the document and the router's cached pages go with it. Its own module, so tests can replace it. */
export const reloadPage = (): void => window.location.reload();

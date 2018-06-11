const ENV = {}

if (process.env.API_URL) {
  window.__env.apiUrl = process.env.API_URL
}

// Import variables if present (from env.js)
if (window) {
  // if clause was implemented to set a other BE Url (in our case for the End2End-tests)
  if (typeof BACK_END_URL !== 'undefined') {
    window.__env.apiUrl = BACK_END_URL
  }
  Object.assign(ENV, window.__env)
}

export default ENV

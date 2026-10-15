// Web_Version_APP entry point.
//
// Imports the shopper app's main.jsx for its side effects (it mounts the
// React tree itself) so we share the tree with APP_shopper_and_buyer/
// (the Capacitor / Android APK source) without duplicating bootstrap
// code. Everything else in this project — index.html, components, pages —
// is pulled in through the Vite "src" alias from the shopper source tree.
//
// (This used to `export { default }`, but the shopper main.jsx has no
// default export, which made Vite's dependency scan fail on startup.)
import '../../APP_shopper_and_buyer/src/main.jsx';

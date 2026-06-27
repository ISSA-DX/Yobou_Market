// Web_Version_APP entry point.
//
// Re-exports the shopper app's main.jsx verbatim so we share the React tree
// with APP_shopper_and_buyer/ (the Capacitor / Android APK source) without
// duplicating bootstrap code. Everything else in this project — index.html,
// components, pages — is pulled in through the Vite "src" alias from the
// shopper source tree.
export { default } from '../../APP_shopper_and_buyer/src/main.jsx';

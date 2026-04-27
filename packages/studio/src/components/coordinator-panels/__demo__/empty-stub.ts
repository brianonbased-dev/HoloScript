// Empty stub for optional deps that aren't installed in the demo
// (@aztec/bb.js, @holoscript/holo-vm). The panels never reach the
// code paths that use them; they're only pulled in transitively
// through @holoscript/core's barrel. This stub satisfies the vite
// import-analyzer without requiring a real package install.
export default {};

// Phase C.4 (2026-06-07): no-op shim cho `server-only` Next.js package
// trong vitest môi trường node.
// Trong production, Next.js webpack tự throw nếu module import 'server-only'
// bị bundle vào client. Test runner KHÔNG bundle → an toàn no-op.
export {};

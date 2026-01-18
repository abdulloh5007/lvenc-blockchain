interface HealthResponse {
    status: string;
    blocks: number;
    peers: number;
    network: string;
}

export async function showStatus(port: number): Promise<void> {
    try {
        const response = await fetch(`http://localhost:${port}/health`);
        const data = await response.json() as HealthResponse;

        console.log(`
╔═══════════════════════════════════════╗
║          LVE Chain Node Status        ║
╠═══════════════════════════════════════╣
║  Status:    ${data.status === 'ok' ? '🟢 Running' : '🔴 Error'}              ║
║  Blocks:    ${String(data.blocks).padEnd(20)}      ║
║  Peers:     ${String(data.peers).padEnd(20)}      ║
║  Network:   ${String(data.network).padEnd(20)}    ║
╚═══════════════════════════════════════╝
        `);
    } catch {
        console.log(`
╔═══════════════════════════════════════╗
║          LVE Chain Node Status        ║
╠═══════════════════════════════════════╣
║  Status:    🔴 Offline                ║
║                                       ║
║  Node is not running on port ${port}    ║
╚═══════════════════════════════════════╝
        `);
    }
}

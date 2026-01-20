interface NetworkResponse {
    success: boolean;
    data: {
        connectedPeers: number;
        peers?: string[];
    };
}

export async function showPeers(port: number): Promise<void> {
    try {
        const response = await fetch(`http://localhost:${port}/api/network`);
        const result = await response.json() as NetworkResponse;

        if (result.success) {
            console.log(`
╔═══════════════════════════════════════╗
║          Connected Peers              ║
╠═══════════════════════════════════════╣`);

            if (result.data.connectedPeers === 0) {
                console.log(`║  No peers connected                   ║`);
            } else {
                console.log(`║  Total peers: ${result.data.connectedPeers}                       ║`);
                result.data.peers?.forEach((peer: string, i: number) => {
                    console.log(`║  ${i + 1}. ${peer.padEnd(32)} ║`);
                });
            }

            console.log(`╚═══════════════════════════════════════╝`);
        }
    } catch {
        console.log(`
╔═══════════════════════════════════════╗
║          Connected Peers              ║
╠═══════════════════════════════════════╣
║  Error: Node is not running           ║
╚═══════════════════════════════════════╝
        `);
    }
}

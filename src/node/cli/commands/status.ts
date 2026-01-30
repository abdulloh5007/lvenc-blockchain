import { infoBox, errorBox } from '../../../protocol/utils/cli.js';

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

        const statusText = data.status === 'ok' ? '🟢 Running' : '🔴 Error';

        console.log('');
        console.log(infoBox(
            `Status:    ${statusText}\n` +
            `Blocks:    ${data.blocks}\n` +
            `Peers:     ${data.peers}\n` +
            `Network:   ${data.network}`,
            '📊 LVE Chain Node Status'
        ));
        console.log('');
    } catch {
        console.log('');
        console.log(errorBox(
            `Status:    🔴 Offline\n\n` +
            `Node not running on port ${port}`,
            '📊 LVE Chain Node Status'
        ));
        console.log('');
    }
}

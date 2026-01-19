import { boxCenter, boxSeparator, boxTop, boxBottom } from '../../utils/box.js';

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
        console.log(boxTop(39));
        console.log(boxCenter('LVE Chain Node Status', 39));
        console.log(boxSeparator(39));
        console.log(boxCenter(`Status:    ${statusText}`, 39));
        console.log(boxCenter(`Blocks:    ${data.blocks}`, 39));
        console.log(boxCenter(`Peers:     ${data.peers}`, 39));
        console.log(boxCenter(`Network:   ${data.network}`, 39));
        console.log(boxBottom(39));
        console.log('');
    } catch {
        console.log('');
        console.log(boxTop(39));
        console.log(boxCenter('LVE Chain Node Status', 39));
        console.log(boxSeparator(39));
        console.log(boxCenter('Status:    🔴 Offline', 39));
        console.log(boxCenter('', 39));
        console.log(boxCenter(`Node not running on port ${port}`, 39));
        console.log(boxBottom(39));
        console.log('');
    }
}

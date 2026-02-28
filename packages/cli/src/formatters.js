/**
 * Output formatters for CLI
 */
export function formatAST(ast, options = {}) {
    if (options.json) {
        return JSON.stringify(ast, null, 2);
    }
    return ast.map((node, i) => formatNode(node, i)).join('\n\n');
}
function formatNode(node, index) {
    const lines = [];
    lines.push(`[${index}] ${node.type.toUpperCase()}`);
    if ('name' in node && node.name) {
        lines.push(`    name: ${node.name}`);
    }
    if (node.position) {
        const { x, y, z } = node.position;
        lines.push(`    position: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
    }
    if (node.hologram) {
        lines.push(`    hologram: ${node.hologram.shape} (${node.hologram.color})`);
    }
    return lines.join('\n');
}
export function formatError(error) {
    const message = typeof error === 'string' ? error : error.message;
    return `Error: ${message}`;
}
export function formatResult(result, options = {}) {
    if (options.json) {
        return JSON.stringify(result, null, 2);
    }
    const lines = [];
    lines.push(`Execution ${result.success ? 'succeeded' : 'failed'}`);
    if (result.executionTime !== undefined) {
        lines.push(`Duration: ${result.executionTime}ms`);
    }
    if (result.error) {
        lines.push(`\nError: ${result.error}`);
    }
    if (result.hologram) {
        lines.push(`\nHologram: ${result.hologram.shape} (${result.hologram.color})`);
    }
    if (result.spatialPosition) {
        const { x, y, z } = result.spatialPosition;
        lines.push(`Position: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
    }
    if (result.output) {
        lines.push(`\nOutput:`);
        lines.push(JSON.stringify(result.output, null, 2));
    }
    return lines.join('\n');
}

/**
 * Guards the Heroku web startup so Datadog APM receives traces.
 *
 * The app is ESM, so dd-trace must load through the Node import hook
 * before Express. The CLI and stdio entrypoints stay free of the tracer:
 * their stdout is the MCP protocol.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_PROCESS = 'node --import dd-trace/initialize.mjs dist/index.js';

/**
 * Reads a repository file as UTF-8 text.
 *
 * @param path - Path relative to the repository root.
 * @returns The file contents.
 */
function readRepoFile(path: string): string {
    return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Datadog tracer startup', () => {
    it('should load the Datadog ESM hook before the app when Heroku starts the web process', () => {
        const procfile = readRepoFile('Procfile');

        expect(procfile).toBe(`web: ${WEB_PROCESS}\n`);
    });

    it('should load the Datadog ESM hook before the app when npm start runs the HTTP server', () => {
        const pkg = JSON.parse(readRepoFile('package.json')) as { scripts: { start: string } };

        expect(pkg.scripts.start).toBe(WEB_PROCESS);
    });

    it('should keep the stdio command free of the Datadog hook when a local MCP host starts the CLI', () => {
        const pkg = JSON.parse(readRepoFile('package.json')) as {
            scripts: { 'start:stdio': string };
            bin: { 'envia-mcp': string };
        };

        expect(pkg.scripts['start:stdio']).toBe('MCP_TRANSPORT=stdio node dist/index.js');
        expect(pkg.bin['envia-mcp']).toBe('dist/index.js');
    });

    it('should depend on dd-trace at runtime when the web process imports the hook', () => {
        const pkg = JSON.parse(readRepoFile('package.json')) as {
            dependencies: Record<string, string>;
            devDependencies: Record<string, string>;
        };

        expect(pkg.dependencies['dd-trace']).toEqual(expect.any(String));
        expect(pkg.devDependencies['dd-trace']).toBeUndefined();
    });
});

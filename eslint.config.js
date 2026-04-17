import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        files: ['src/**/*.ts'],
        extends: [tseslint.configs.base],
        rules: {
            /**
             * All tool handlers must return via textResponse() from src/utils/mcp-response.ts.
             * The raw { content: [{ type: 'text', ... }] } shape is legacy — do not add more.
             * See LESSONS.md L-C3.
             */
            'no-restricted-syntax': [
                'error',
                {
                    selector: "Property[key.name='content'] > ArrayExpression > ObjectExpression > Property[key.name='type'][value.value='text']",
                    message: "Use textResponse() from src/utils/mcp-response.ts instead of returning raw { content: [{ type: 'text', ... }] }. See LESSONS.md L-C3.",
                },
            ],
        },
    },
    {
        ignores: ['dist/**', 'node_modules/**', '**/*.test.ts'],
    },
);

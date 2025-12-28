module.exports = {
    auth: {
        input: {
            target: './auth-server/auth-openapi.json',
        },
        output: {
            target: './src/lib/api/auth.ts',
            client: 'react-query',
            mode: 'single',
            override: {
                mutator: {
                    path: './src/lib/api/custom-instance.ts',
                    name: 'customInstance',
                },
            },
        },
    },
};

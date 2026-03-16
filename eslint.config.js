import { antfu } from '@antfu/eslint-config'

export default antfu({
    stylistic: {
        indent: 4,
    },
    rules: {
        'no-console': 'off',
        'node/prefer-global/process': 'off',
    },
})

import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const config = [
  {
    input: 'src/index.ts',
    output: [
      { file: 'dist/index.mjs', format: 'esm', sourcemap: true },
      { file: 'dist/index.cjs', format: 'cjs', sourcemap: true },
    ],
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
      }),
    ],
    external: [/node_modules/],
  },
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.d.ts', format: 'esm' },
    plugins: [dts()],
    external: [/node_modules/],
  },
];

export default config;

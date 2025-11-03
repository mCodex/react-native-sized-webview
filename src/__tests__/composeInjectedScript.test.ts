import { composeInjectedScript } from '../utils/composeInjectedScript';

describe('composeInjectedScript', () => {
  it('returns undefined when no chunks are provided', () => {
    expect(composeInjectedScript()).toBeUndefined();
  });

  it('compacts falsy chunks and appends the evaluation guard', () => {
    const script = composeInjectedScript(
      'const a = 1;',
      undefined,
      'const b = 2;'
    );

    expect(script).toContain('const a = 1;');
    expect(script).toContain('const b = 2;');
    expect(script?.trim().endsWith('true;')).toBe(true);
  });

  it('joins chunks with newlines to keep snippets readable', () => {
    const script = composeInjectedScript('a();', 'b();');

    expect(script?.split('\n')).toHaveLength(3);
  });
});

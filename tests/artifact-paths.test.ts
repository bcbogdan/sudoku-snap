import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

test('app screenshots belong to the runner output directory, never shared review paths', async () => {
  const directory = new URL('./', import.meta.url);
  const violations: string[] = [];
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.spec.ts'))) {
    const source = ts.createSourceFile(
      name,
      await readFile(new URL(name, directory), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'screenshot'
      ) {
        const options = node.arguments[0];
        if (options && ts.isObjectLiteralExpression(options)) {
          for (const property of options.properties) {
            if (ts.isPropertyAssignment(property) && property.name.getText(source) === 'path') {
              const value = property.initializer;
              if (!(
                ts.isCallExpression(value) &&
                ts.isPropertyAccessExpression(value.expression) &&
                value.expression.name.text === 'outputPath'
              )) {
                violations.push(
                  `${name}:${source.getLineAndCharacterOfPosition(property.getStart()).line + 1}`,
                );
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(
    violations,
    [],
    'Use TestInfo.outputPath so --output and TMPDIR isolation remain effective',
  );
});

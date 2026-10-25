import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchProducts } from './src/catalog.mjs';

test('inStock keeps only products with stock', () => {
  const products = [
    { sku: 'a', name: 'Apron', priceCents: 900, stock: 0 },
    { sku: 'b', name: 'Bowl', priceCents: 700, stock: 2 },
  ];
  assert.deepEqual(searchProducts(products, { inStock: true }).map((p) => p.sku), ['b']);
  assert.deepEqual(searchProducts(products, { inStock: false }).map((p) => p.sku), ['a', 'b']);
});

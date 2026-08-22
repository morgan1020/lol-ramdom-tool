import { positions } from './draw.js';

export function formatCopyText(results) {
  const entries = [...results]
    .sort((a, b) => positions.indexOf(a.main) - positions.indexOf(b.main))
    .map((result) => {
      const roles = result.secondary ? `${result.main}／${result.secondary}` : result.main;
      return `> **${result.name}**　${roles}`;
    });

  return ['### 英雄聯盟分路結果', ...entries].join('\n');
}


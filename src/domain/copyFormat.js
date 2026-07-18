import { positions } from './draw.js';

const roleEmoji = {
  上路: '🛡️',
  打野: '🌲',
  中路: '🔮',
  下路: '🏹',
  輔助: '💚'
};

export function formatCopyText(results) {
  const entries = [...results]
    .sort((a, b) => positions.indexOf(a.main) - positions.indexOf(b.main))
    .map((result) => {
      const roles = result.secondary ? `${result.main}／${result.secondary}` : result.main;
      return `> ${roleEmoji[result.main]} **${result.name}**　${roles}`;
    });

  return ['### 🎲 英雄聯盟分路結果', ...entries].join('\n');
}

